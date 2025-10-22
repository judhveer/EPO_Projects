import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { sequelize } from "../../config/db.js";
const bot = new Telegraf(process.env.BOT_TOKEN);



const ROLES = {
    // boss: 7724001439,         // ← replace with your Telegram ID
    // boss: 1359630106,        // judhveer
    boss: 1096067043,   // harsh sir
    ea:6445053570       // EWAN EA
    // ea: 1359630106            // ← EA's Telegram ID
};




// ========== 1. Helper: Check if current user is the Boss ==========
// Checks if the current ctx is from the Boss by comparing chatId to ROLES.boss
function isBoss(ctx) {
    const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
    return chatId === ROLES.boss;
}

async function isMIS(ctx) {
    const telegramId = getChatId(ctx);
    const me = await db.Doer.findOne({ where: { telegramId, isApproved: true } });
    return !!me && me.department === 'MIS';
}



// ========== 2. Show Tasks by Status for Doers ==========
// Given a status (pending, completed, etc.), fetches up to 10 tasks for the current doer
// Sends each task as a message, with action buttons for 'pending'/'revised' statuses
async function showTasksByStatus(ctx, status) {
    const telegramId = ctx.chat.id;
    const doer = await db.Doer.findOne({ where: { telegramId } });
    if (!doer) return ctx.reply("❌ Not registered.");

    const whereClause = { doer: doer.name, status };

    if (status === 'pending') {
        whereClause.status = { [Op.or]: ['pending', 'revised'] };
    } else {
        whereClause.status = status;
    }

    const tasks = await db.Task.findAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit: 10
    });

    if (!tasks.length)
        return ctx.reply(`📭 No *${status}* tasks found.`, { parse_mode: 'Markdown' });

    for (const task of tasks) {
        // Inline buttons only for pending/revised
        let buttons = [];
        if (status === 'pending' || status === 'revised') {
            buttons = [
                [Markup.button.callback('✅ Mark as Completed', `TASK_DONE_${task.id}`)],
                [Markup.button.callback('🗓️ Request Extension', `TASK_EXT_${task.id}`)],
                [Markup.button.callback('🚫 Request Cancellation', `TASK_CANCEL_${task.id}`)]
            ];
        }
        await ctx.reply(
            `📝 *Task:* ${task.task}
🆔 *ID:* ${task.id}
⏱️ *Urgency:* ${task.urgency}
📅 *Due Date:* ${task.dueDate ? new Date(task.dueDate).toDateString() : 'ASAP'}
📌 *Status:* ${task.status.charAt(0).toUpperCase() + task.status.slice(1)}`,
            {
                parse_mode: 'Markdown',
                ...(buttons.length && Markup.inlineKeyboard(buttons)),
            }
        );
    }
}





// FOR DOERS

// ========== 3. Doer Self-Registration Command ==========
// /register: Allows a user to register their Telegram ID if their name exists in the Doer table
// If already registered, notifies user. If not found in DB, asks to contact admin.
// doer will register themselves and all the register user will save to the doers table which can be shown to boss to assign task
// Session object for multi-step registration
let registrationSession = {};
bot.command('register', async (ctx) => {
    const chatId = getChatId(ctx);
    const telegramId = chatId;
    const fullName = `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim().toUpperCase();

    // Reset session for fresh registration
    registrationSession[chatId] = {};

    try {
        let doer = await db.Doer.findOne({ where: { telegramId } });

        if (doer) {
            if (doer.approvalStatus === 'PENDING') {
                delete registrationSession[chatId];
                return ctx.reply("🕒 Your registration is pending MIS approval. Please wait or contact MIS");
            }

            if (doer && doer.approvalStatus === 'REJECTED') {
                await ctx.reply("❌ Your registration was rejected. Please contact MIS or re-register with correct details.");
            }

            // Already registered
            registrationSession[chatId] = {
                doerId: doer.id,
                step: 'already_registered',
                name: doer.name,
                department: doer.department
            };

            // Already has department?
            if (doer.department) {
                await ctx.reply(`✅ You are already registered as *${doer.name}* in *${doer.department}* department.\n\nDo you want to change your department?`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('Yes', 'REG_CHANGE_DEPT')],
                        [Markup.button.callback('No', 'REG_CANCEL')]
                    ])
                });
            } else {
                registrationSession[chatId].step = 'choose_department_update';
                // Missing department—let them set it
                showDepartmentOptions(ctx, 'Please select your department to update:', 'REG_SELECT_DEPT_UPDATE');
            }
            //  Stop here — don't go to fallback name check
            return;
        }

        const firstNameOnly = ctx.from.first_name.trim().toUpperCase().split(' ')[0];
        // If no doer exists with this Telegram ID → check by name (maybe unlinked doer exists)
        doer = await db.Doer.findOne({
            where: {
                [Op.or]: [
                    { name: fullName },
                    { name: firstNameOnly }
                ],
                telegramId: null
            }
        });

        if (doer) {
            // Doer exists in DB by name but not yet registered
            registrationSession[chatId] = { doerId: doer.id, step: 'choose_department', name: doer.name };

            if (doer.department) {
                doer.telegramId = telegramId;
                await doer.save();
                ctx.reply(`✅ ${doer.name}, you are now registered with Telegram ID and department: *${doer.department}*.`, {
                    parse_mode: 'Markdown'
                });
                delete registrationSession[chatId];
            } else {
                showDepartmentOptions(ctx, 'Please select your department:', 'REG_SELECT_DEPT');
            }
        } else {
            // Not found in DB at all
            registrationSession[chatId] = { step: 'not_in_table', fullName };
            ctx.reply(`❌ Your name "${fullName}" is not found in the system. Do you want to register yourself?`, {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('Yes', 'REG_SELF_ADD')],
                    [Markup.button.callback('No', 'REG_CANCEL')]
                ])
            });
        }

    } catch (error) {
        console.error("❌ Register error:", error);
        ctx.reply("⚠️ Registration failed. Please try again or contact support.");
        delete registrationSession[chatId];
    }
});

// Helper to show department options as buttons
function showDepartmentOptions(ctx, prompt, prefix = 'REG_SELECT_DEPT') {
    // You can get from Doer model or hardcode for now:
    const departments = [
        "Accounts", "Admin", "CRM", "Designer", "EA", "Foundation", "HR",
        "MIS", "Office Assistant", "Process Coordinator", "Receptionist",
        "Sales dept", "Tender Executive"
    ];
    const buttons = departments.map(dep => [Markup.button.callback(dep, `${prefix}_${dep}`)]);
    return ctx.reply(prompt, Markup.inlineKeyboard(buttons));
}
// 1. If already registered and wants to change department
bot.action('REG_CHANGE_DEPT', (ctx) => {
    const chatId = getChatId(ctx);
    if (!registrationSession[chatId] || !registrationSession[chatId].doerId) return ctx.reply("Session expired. Please use /register again.");
    registrationSession[chatId].step = 'choose_department_update';
    showDepartmentOptions(ctx, 'Please select your new department:', 'REG_SELECT_DEPT_UPDATE');
});

// 2. If chooses department (update path)
bot.action(/REG_SELECT_DEPT_UPDATE_(.+)/, async (ctx) => {
    const chatId = getChatId(ctx);
    const department = ctx.match[1];
    const reg = registrationSession[chatId];
    if (!reg || !reg.doerId) {
        return ctx.reply("Session expired. Please use /register again.");
    }
    try {
        const doer = await db.Doer.findByPk(reg.doerId);
        if (!doer) throw new Error("Doer not found.");


        // store both the old and the requested new dept
        doer.departmentPrev = doer.department || null;
        doer.pendingDepartment = department;
        doer.requestType = 'DEPT_CHANGE';
        doer.requestedAt = new Date();

        // Mark as approval pending for department change
        doer.approvalStatus = 'PENDING';
        doer.isApproved = false;
        await doer.save();

        ctx.reply(`📝 Your request to change department to *${department}* has been sent to MIS for approval. Please wait...`, {
            parse_mode: 'Markdown'
        });

        // Send approval request to MIS
        const misDoers = await db.Doer.findAll({
            where: {
                department: 'MIS',
                telegramId: { [Op.not]: null },
                isApproved: true
            }
        });

        misDoers.forEach(mis => {
            if (!mis.telegramId || mis.telegramId.toString().length > 12) {
                console.warn(`Skipping MIS user with invalid telegramId:`, mis.name, mis.telegramId);
                return;
            }
            bot.telegram.sendMessage(mis.telegramId,
                `📥 *Department Change Request:*\n👤 *${doer.name}*\nOld Dept: *${doer.department}*\nNew Dept: *${department}*`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Approve', `REG_APPROVE_DEPT_CHANGE_${doer.id}_${department}`)],
                        [Markup.button.callback('❌ Reject', `REG_REJECT_DEPT_CHANGE_${doer.id}`)]
                    ])
                }
            );
        });

        delete registrationSession[chatId];
    } catch (e) {
        console.error("❌ Failed to send department change request:", e);
        ctx.reply("⚠️ Failed to request department change. Try again.");
    }
});

bot.action(/REG_APPROVE_DEPT_CHANGE_(\d+)_(.+)/, async (ctx) => {
    const doerId = ctx.match[1];

    try {
        const doer = await db.Doer.findByPk(doerId);
        const newDepartment = doer.pendingDepartment || ctx.match[2];
        if (!doer) return ctx.reply("Doer not found.");

        // Guard: Prevent double-approval
        if (doer.approvalStatus !== 'PENDING') {
            return ctx.reply("⚠️ This request has already been processed.");
        }

        doer.department = newDepartment;
        doer.isApproved = true;
        doer.approvalStatus = 'APPROVED';
        const approvedBy = `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim();
        doer.approvedBy = approvedBy.toUpperCase();

        doer.requestType = 'NONE';
        doer.pendingDepartment = null;
        doer.decisionAt = new Date();


        await doer.save();

        await bot.telegram.sendMessage(doer.telegramId, `✅ Your department change to *${newDepartment}* has been approved!`, {
            parse_mode: 'Markdown'
        });

        ctx.reply(`👍 Department updated for *${doer.name}*.`);

        // Remove buttons and update original MIS message
        if (ctx.callbackQuery?.message?.message_id && ctx.callbackQuery?.message?.chat?.id) {
            await ctx.editMessageReplyMarkup(); // Removes all inline keyboard buttons
            await ctx.editMessageText(
                `✅ Department change request for *${doer.name}* was approved by MIS.\n\nNew Department: *${newDepartment}*`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (e) {
        console.error("❌ Error approving department change:", e);
        ctx.reply("⚠️ Could not approve department change.");
    }
});

bot.action(/REG_REJECT_DEPT_CHANGE_(\d+)/, async (ctx) => {
    const doerId = ctx.match[1];
    const doer = await db.Doer.findByPk(doerId);
    if (!doer) return ctx.reply("Doer not found.");

    // Already processed? Only allow if pending
    if (doer.approvalStatus !== 'PENDING') {
        return ctx.reply("⚠️ This request has already been processed.");
    }

    doer.isApproved = true; // Re-enable access
    doer.approvalStatus = 'REJECTED';
    const approvedBy = `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim();
    doer.approvedBy = approvedBy.toUpperCase();

    doer.requestType = 'NONE';
    doer.pendingDepartment = null;
    doer.decisionAt = new Date();

    await doer.save();

    await bot.telegram.sendMessage(doer.telegramId, `❌ Your request to change department was rejected by MIS.`, { parse_mode: 'Markdown' });
    ctx.reply(`🚫 Rejected department change for *${doer.name}*.`);

    // Optional: edit the original MIS message to show status and disable buttons
    if (ctx.callbackQuery?.message?.message_id && ctx.callbackQuery?.message?.chat?.id) {
        await ctx.editMessageReplyMarkup(); // This removes the inline keyboard (buttons)
        await ctx.editMessageText(`❌ Department change request for *${doer.name}* was rejected by MIS.`, { parse_mode: 'Markdown' });
    }
});

// 4. If not in table, wants to self-add
bot.action('REG_SELF_ADD', (ctx) => {
    const chatId = getChatId(ctx);
    if (!registrationSession[chatId]) {
        // console.log("at REG_SELF_ADD");
        return ctx.reply("Session expired. Please use /register again.");
    }
    registrationSession[chatId].step = 'ask_name';
    ctx.reply("Please type your full name as per records (in UPPERCASE):");
});

// 5. Capture name input from user
bot.on('text', async (ctx, next) => {
    const chatId = getChatId(ctx);
    const reg = registrationSession[chatId];
    if (!reg) return next();
    // If at "ask_name" step (new doer self-registration)
    if (reg.step === 'ask_name') {
        registrationSession[chatId].pendingName = ctx.message.text.trim().toUpperCase();
        registrationSession[chatId].step = 'ask_department_self_add';
        // Delay a bit to avoid race condition
        setTimeout(() => {
            showDepartmentOptions(ctx, 'Now select your department:', 'REG_SELECT_DEPT_SELF_ADD');
        }, 100);
        return;
    }
    return next();
});

// 6. Choose department for self-added doer
bot.action(/REG_SELECT_DEPT_SELF_ADD_(.+)/, async (ctx) => {
    const chatId = getChatId(ctx);
    const reg = registrationSession[chatId];
    const department = ctx.match[1];

    // LOG for debugging
    if (!reg) {
        console.log('Registration session missing for chat:', chatId);
        return ctx.reply("Session expired. Please use /register again.");
    }
    if (reg.step !== 'ask_department_self_add') {
        console.log('Registration session step mismatch:', reg.step, 'for chat:', chatId);
        return ctx.reply("Session expired. Please use /register again.");
    }

    try {
        await db.Doer.create({
            name: reg.pendingName,
            telegramId: chatId,
            department,
            isActive: false,
            isApproved: false,
            approvalStatus: 'PENDING',
            approvedBy: null,
            requestType: 'REGISTRATION',
            requestedAt: new Date()

        });

        ctx.reply(`📝 Your request to register as *${reg.pendingName}* in *${department}* department has been sent for approval. Please wait...`, { parse_mode: 'Markdown' });

        // Notify MIS team
        const misDoers = await db.Doer.findAll({
            where: {
                department: 'MIS',
                telegramId: { [Op.not]: null },
                isApproved: true
            }
        });

        misDoers.forEach(mis => {
            bot.telegram.sendMessage(mis.telegramId,
                `📥 *New Registration Request:*\n👤 Name: *${reg.pendingName}*\n🏢 Department: *${department}*`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Approve', `REG_APPROVE_REQUEST_${chatId}`)],
                        [Markup.button.callback('❌ Reject', `REG_REJECT_REQUEST_${chatId}`)]
                    ])
                }
            );
        });

        delete registrationSession[chatId];
    } catch (e) {
        ctx.reply("Failed to create your record. It may already exist.");
    }
});

bot.action(/REG_APPROVE_REQUEST_(\d+)/, async (ctx) => {
    const requesterId = ctx.match[1];

    const doer = await db.Doer.findOne({ where: { telegramId: requesterId } });
    if (!doer) return ctx.reply("Doer not found.");
    // Guard: Prevent double approval
    if (doer.isApproved && doer.approvalStatus === 'APPROVED') {
        return ctx.reply("Already approved.");
    }
    if (doer.approvalStatus !== 'PENDING') {
        return ctx.reply("⚠️ This request has already been processed.");
    }
    doer.isApproved = true;
    doer.isActive = true;
    doer.approvalStatus = 'APPROVED';
    const approvedBy = `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim();
    doer.approvedBy = approvedBy.toUpperCase();

    doer.requestType = 'NONE';
    doer.decisionAt = new Date();


    await doer.save();

    await bot.telegram.sendMessage(requesterId, `✅ Your registration has been approved! You can now use the bot.`, { parse_mode: 'Markdown' });
    ctx.reply(`👍 Approved *${doer.name}*.`);

    // Remove the approve/reject buttons and update the MIS message
    if (ctx.callbackQuery?.message?.message_id && ctx.callbackQuery?.message?.chat?.id) {
        await ctx.editMessageReplyMarkup(); // removes the buttons
        await ctx.editMessageText(
            `✅ Registration request for *${doer.name}* was approved by MIS.`,
            { parse_mode: 'Markdown' }
        );
    }
});

bot.action(/REG_REJECT_REQUEST_(\d+)/, async (ctx) => {
    const requesterId = ctx.match[1];

    const doer = await db.Doer.findOne({ where: { telegramId: requesterId } });
    if (!doer) return ctx.reply("Doer not found.");

    // Guard: Prevent double rejection or processing
    if (doer.approvalStatus !== 'PENDING') {
        return ctx.reply("⚠️ This request has already been processed.");
    }

    await doer.destroy();

    await bot.telegram.sendMessage(requesterId, `❌ Your registration request was rejected by MIS.`, { parse_mode: 'Markdown' });
    ctx.reply(`🚫 Rejected registration for *${doer.name}*.`);
    // Remove buttons and update the MIS message
    if (ctx.callbackQuery?.message?.message_id && ctx.callbackQuery?.message?.chat?.id) {
        await ctx.editMessageReplyMarkup(); // Removes all buttons
        await ctx.editMessageText(
            `❌ Registration request for *${doer.name}* was rejected by MIS.`,
            { parse_mode: 'Markdown' }
        );
    }
});

// 3. If chooses department (new registration path)
bot.action(/REG_SELECT_DEPT_(.+)/, async (ctx) => {
    const chatId = getChatId(ctx);
    const department = ctx.match[1];
    const reg = registrationSession[chatId];
    if (!reg || !reg.doerId) {
        return ctx.reply("Session expired. Please use /register again.");
    }
    try {
        const doer = await db.Doer.findByPk(reg.doerId);
        if (!doer) throw new Error("Doer not found.");
        doer.telegramId = chatId;
        doer.department = department;
        await doer.save();
        ctx.reply(`✅ You are now registered in *${department}* department!`, { parse_mode: 'Markdown' });
        delete registrationSession[chatId];
    } catch (e) {
        ctx.reply("Failed to register.");
    }
});
// Cancel path
bot.action('REG_CANCEL', (ctx) => {
    const chatId = getChatId(ctx);
    ctx.reply("Registration cancelled.");
    delete registrationSession[chatId];
});

// ========== 4. Show Task Filter Buttons for Doers ==========
// /tasks: Only available to non-boss users; displays filter buttons to view tasks by status
// Four inline buttons for pending/completed/revised/canceled
bot.command('tasks', async (ctx) => {

    if (isBoss(ctx)) return ctx.reply("❌ Bosses delegate, not do! 😎");

    const telegramId = getChatId(ctx);
    const doer = await db.Doer.findOne({ where: { telegramId } });

    if (!doer) {
        return ctx.reply("❌ You are not registered. Use /register first.");
    }

    if (!doer.isApproved) {
        return ctx.reply("⛔ You are not approved to use this feature yet. Please wait for MIS to approve your registration.");
    }

    if (doer.approvalStatus === 'PENDING') {
        return ctx.reply("🕒 You already have a department change request pending approval.");
    }

    // Status filter buttons
    return ctx.reply(
        "🔍 *View your tasks by status:*",
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⏳ Pending', 'TASKS_PENDING')],
                [Markup.button.callback('✅ Completed', 'TASKS_COMPLETED')],
                [Markup.button.callback('📝 Revised', 'TASKS_REVISED')],
                [Markup.button.callback('❌ Cancelled', 'TASKS_CANCELED')],
            ])
        }
    );


});

// ========== 5. Action Handlers for Task Status Filters ==========
// Handles clicks on the filter buttons to display the relevant tasks list for doer
bot.action('TASKS_PENDING', ctx => showTasksByStatus(ctx, 'pending'));
bot.action('TASKS_COMPLETED', ctx => showTasksByStatus(ctx, 'completed'));
bot.action('TASKS_REVISED', ctx => showTasksByStatus(ctx, 'revised'));
bot.action('TASKS_CANCELED', ctx => showTasksByStatus(ctx, 'canceled'));


const userSessions = {};
// ========== 6. Mark Task as Completed Handler ==========
// Handles the "Mark as Completed" button, updates task status, notifies EA and doer
bot.action(/^TASK_DONE_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery(); // closes loading state on button
    const taskId = parseInt(ctx.match[1]);
    const chatId = getChatId(ctx);

    // Clear any session for this user
    delete userSessions[chatId];

    const doer = await db.Doer.findOne({ where: { telegramId: chatId } });
    const task = await db.Task.findByPk(taskId);

    if (!task || !doer || task.doer !== doer.name)
        return ctx.reply("⚠️ Task not found or not assigned.");

    if (task.status === 'completed')
        return ctx.reply("✅ Already marked as completed.");

    task.status = 'completed';
    await task.save();

    ctx.reply("🎉 *Congrats!* Task marked as *Completed*. 🚀", { parse_mode: 'Markdown' });

    // Notify EA
    await bot.telegram.sendMessage(
        ROLES.ea,
        `🎯 *Task Completed*\n\n👤 *Doer:* ${doer.name}\n📝 *Task:* ${task.task}\n🆔 *ID:* ${task.id}\n✅ Status: *Completed*`,
        { parse_mode: 'Markdown' }
    );
});

// ========== 7. Request Task Extension: Start Session ==========
// Handles "Request Extension" button; asks doer to type new due date in YYYY-MM-DD format

bot.action(/^TASK_EXT_(\d+)$/, async (ctx) => {
    const chatId = getChatId(ctx);
    const taskId = parseInt(ctx.match[1]);
    userSessions[chatId] = { type: 'extension', taskId };
    await ctx.answerCbQuery();
    await ctx.reply(
        "📅 Please enter the *new due date* for your extension in the format YYYY-MM-DD (e.g. 2024-07-15).\n\n_Type `/cancel` to stop this process._",
        { parse_mode: 'Markdown' }
    );

});

// ========== 9. Request Task Cancellation: Start Session ==========
// Handles "Request Cancellation" button; asks doer to type reason, tracks using 
bot.action(/^TASK_CANCEL_(\d+)$/, async (ctx) => {
    const chatId = getChatId(ctx);
    const taskId = parseInt(ctx.match[1]);
    userSessions[chatId] = { type: 'cancellation', taskId };
    await ctx.answerCbQuery();
    await ctx.reply(
        "✍️ Please type your *reason* for cancellation of this task:\n\n_Type `/cancel` to stop this process._",
        { parse_mode: 'Markdown' });
});


// ========== 8. Extension Date Input Handler ==========
// Listens for text input; if user is in userSession(type: "extension"), validates date, saves to DB, notifies EA

// ========== 10. Cancellation Reason Input Handler ==========
// Listens for text input; if user is in userSession(type: "cancelation"), saves reason, sets cancellationRequested=true, notifies EA
bot.on('text', async (ctx, next) => {
    const chatId = getChatId(ctx);

    const session = userSessions[chatId];
    // If no session, move to next handler
    if (!session) return next();

    const text = ctx.message.text.trim();

    // Allow the user to cancel at any time
    if (text.toLowerCase() === '/cancel') {
        delete userSessions[chatId];
        return ctx.reply("❌ Cancelled. You can start again any time.");
    }

    if (session.type === 'extension') {


        // Validate YYYY-MM-DD format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            return ctx.reply("⚠️ *Invalid date format.*\nPlease type the date as YYYY-MM-DD (e.g. 2024-07-15).", { parse_mode: 'Markdown' });
        }

        const dateParts = text.split('-').map(Number);
        const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // compare only date parts

        // Check for invalid dates (e.g. 2024-02-30) and past dates
        if (
            isNaN(date.getTime()) ||
            date.getFullYear() !== dateParts[0] ||
            date.getMonth() !== dateParts[1] - 1 ||
            date.getDate() !== dateParts[2] ||
            date < today
        ) {
            return ctx.reply("⚠️ *Invalid or past date.*\nPlease enter a real, future date as YYYY-MM-DD (e.g. 2024-07-15).", { parse_mode: 'Markdown' });
        }

        // Now process the extension request
        const taskId = session.taskId;
        const doer = await db.Doer.findOne({ where: { telegramId: chatId } });
        const task = await db.Task.findByPk(taskId);

        if (!task || !doer || task.doer !== doer.name) {
            delete userSessions[chatId];
            return ctx.reply("⚠️ Task not found or not assigned.");
        }
        if (task.status === 'completed') {
            delete userSessions[chatId];
            return ctx.reply("✅ Task already completed.");
        }

        // Save extension request
        task.extensionRequestedDate = date;
        await task.save();

        await ctx.reply(
            `📅 Extension requested for *${date.toDateString()}*. EA will review your request.`,
            { parse_mode: 'Markdown' }
        );

        await bot.telegram.sendMessage(
            ROLES.ea,
            `🔁 *Extension Requested*\n\n👤 *Doer:* ${doer.name}\n🆔 *Task ID:* ${task.id}\n📝 *Task:* ${task.task}\n📅 *Requested Date:* ${date.toDateString()}`,
            {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Approve Extension', `EXT_APPROVE_${task.id}`)],
                    [Markup.button.callback('❌ Reject Extension', `EXT_REJECT_${task.id}`)]
                ]).reply_markup
            }
        );
        delete userSessions[chatId];
        return;
    }

    if (session.type === 'cancellation') {
        const reason = text;
        const taskId = session.taskId;
        const doer = await db.Doer.findOne({ where: { telegramId: chatId } });
        const task = await db.Task.findByPk(taskId);

        if (!task || !doer || task.doer !== doer.name) {
            delete userSessions[chatId];
            return ctx.reply("⚠️ Task not found or not assigned.");
        }

        task.cancellationRequested = true;
        task.cancellationReason = reason;
        await task.save();

        await ctx.reply("🚩 Cancellation request submitted. Awaiting EA review.");




        await bot.telegram.sendMessage(
            ROLES.ea,
            `🚫 *Cancellation Requested*\n\n👤 *Doer:* ${doer.name}\n🆔 *Task ID:* ${task.id}\n📝 *Task:* ${task.task}\n✍️ *Reason:* ${reason}`,
            {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Approve Cancel', `CANCEL_APPROVE_${task.id}`)],
                    [Markup.button.callback('❌ Reject Cancel', `CANCEL_REJECT_${task.id}`)]
                ]).reply_markup
            }
        );

        delete userSessions[chatId];
        return;

    }



});




// command for MIS
bot.command('misControl', async (ctx) => {

    if (!(await isMIS(ctx)) && !isBoss(ctx)) {
        return ctx.reply("❌ You are not authorized to access this menu, only MIS and BOSS can access it.");
    }

    ctx.reply(
        `👤 *Available Commands for You:*\n` + "\n" +
        `/pendingregistration - To See Pending Registrations and Department Change Requests\n` + "\n" +
        `/remove - Remove an employee from a database\n` + "\n" +
        `/help - Show this menu`,
        { parse_mode: 'Markdown' }
    );
});



// /mis_requests → shows PENDING registrations and dept-change requests
bot.command('pendingregistration', async (ctx) => {
    if (!(await isMIS(ctx)) && !isBoss(ctx)) {
        return ctx.reply('⛔ Only MIS (or Boss) can use this.');
    }

    // Fetch queues
    const [regs, deps] = await Promise.all([
        db.Doer.findAll({
            where: { approvalStatus: 'PENDING', requestType: 'REGISTRATION' },
            order: [['requestedAt', 'ASC']],
            limit: 25
        }),
        db.Doer.findAll({
            where: { approvalStatus: 'PENDING', requestType: 'DEPT_CHANGE' },
            order: [['requestedAt', 'ASC']],
            limit: 25
        })
    ]);

    if (!regs.length && !deps.length) {
        return ctx.reply('✅ No pending requests.');
    }

    // Render registrations
    if (regs.length) {
        await ctx.reply(`🗂️ *Pending Registrations* (${regs.length})`, { parse_mode: 'Markdown' });
        for (const d of regs) {
            await ctx.reply(
                `👤 *${d.name}*\n🏢 Dept: *${d.department || '—'}*\n🆔 Telegram: \`${d.telegramId}\`\n🕒 Requested: ${d.requestedAt ? d.requestedAt.toDateString() : '—'}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Approve', `REG_APPROVE_REQUEST_${d.telegramId}`)],
                        [Markup.button.callback('❌ Reject', `REG_REJECT_REQUEST_${d.telegramId}`)]
                    ])
                }
            );
        }
    }

    // Render dept-change requests
    if (deps.length) {
        await ctx.reply(`🔁 *Pending Department Changes* (${deps.length})`, { parse_mode: 'Markdown' });
        for (const d of deps) {
            const oldDept = d.departmentPrev || d.department || '—';
            const newDept = d.pendingDepartment || '—';
            await ctx.reply(
                `👤 *${d.name}*\n🧭 From: *${oldDept}* → To: *${newDept}*\n🆔 DoerID: ${d.id}\n🕒 Requested: ${d.requestedAt ? d.requestedAt.toDateString() : '—'}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        // reuse your existing handlers; pass id + newDept
                        [Markup.button.callback('✅ Approve', `REG_APPROVE_DEPT_CHANGE_${d.id}_${newDept}`)],
                        [Markup.button.callback('❌ Reject', `REG_REJECT_DEPT_CHANGE_${d.id}`)]
                    ])
                }
            );
        }
    }
});



// 1) /remove_employee (alias /remove) → choose department
bot.command(['remove_employee', 'remove'], async (ctx) => {
    if (!(await isMIS(ctx)) && !isBoss(ctx)) {
        return ctx.reply('⛔ Only MIS or Boss can remove employees.');
    }
    return showDepartmentOptions(ctx, 'Select the department to remove from:', 'RM_DEPT');
});

const PAGE_SIZE = 10;

// 2) After department pick → list employees (paginated)
async function listDeptEmployees(ctx, dept, page = 1) {
    const offset = (page - 1) * PAGE_SIZE;

    const { rows, count } = await db.Doer.findAndCountAll({
        where: { department: dept },
        order: [['name', 'ASC']],
        limit: PAGE_SIZE,
        offset
    });

    if (!count) {
        return ctx.reply(`📭 No employees found in *${dept}*.`, { parse_mode: 'Markdown' });
    }

    const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    const enc = encodeURIComponent(dept);

    const buttons = rows.map(d => [
        Markup.button.callback(`👤 ${d.name} (#${d.id})`, `RM_PICK_${d.id}_${enc}_${page}`)
    ]);

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `RM_PAGE_${enc}_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `RM_PAGE_${enc}_${page + 1}`));
    if (nav.length) buttons.push(nav);

    return ctx.reply(
        `🗂️ *${dept}* — page ${page}/${totalPages}\nSelect an employee to remove:`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
}



bot.action(/RM_DEPT_(.+)/, async (ctx) => {
    if (!(await isMIS(ctx)) && !isBoss(ctx)) return ctx.answerCbQuery('Only MIS/Boss.');
    await ctx.answerCbQuery();
    const dept = decodeURIComponent(ctx.match[1]);
    return listDeptEmployees(ctx, dept, 1);
});


bot.action(/RM_PAGE_(.+)_(\d+)/, async (ctx) => {
    if (!(await isMIS(ctx)) && !isBoss(ctx)) return ctx.answerCbQuery('Only MIS/Boss.');
    await ctx.answerCbQuery();
    const dept = decodeURIComponent(ctx.match[1]);
    const page = parseInt(ctx.match[2], 10) || 1;
    // Send a fresh list message (keeps code simple; avoids edit edge cases)
    return listDeptEmployees(ctx, dept, page);
});

// 3) Pick employee → show confirmation (with pending-task count)
bot.action(/RM_PICK_(\d+)_([^_]+)_(\d+)/, async (ctx) => {
    if (!(await isMIS(ctx)) && !isBoss(ctx)) return ctx.answerCbQuery('Only MIS/Boss.');
    await ctx.answerCbQuery();

    const doerId = parseInt(ctx.match[1], 10);
    const dept = decodeURIComponent(ctx.match[2]);
    const page = parseInt(ctx.match[3], 10) || 1;

    const doer = await db.Doer.findByPk(doerId);
    if (!doer) return ctx.reply('❌ Employee not found (maybe already removed).');

    let pendingCount = 0;
    try {
        pendingCount = await db.Task.count({
            where: { doer: doer.name, status: { [Op.in]: ['pending', 'revised'] } }
        });
    } catch { /* ignore */ }

    const enc = encodeURIComponent(dept);
    const text =
        `⚠️ *Confirm removal*
👤 *${doer.name}*
🏢 Dept: *${doer.department || '—'}*
📌 Pending tasks: *${pendingCount}*

This action *permanently deletes* the employee. It cannot be undone.`;

    return ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🗑️ Yes, remove permanently', `RM_CONFIRM_${doer.id}`)],
            [
                Markup.button.callback('⬅️ Back', `RM_PAGE_${enc}_${page}`),
                Markup.button.callback('Cancel', 'RM_CANCEL')
            ]
        ])
    });
});

// 4) Confirm removal → DM user (best effort), delete, acknowledge
bot.action(/RM_CONFIRM_(\d+)/, async (ctx) => {
    if (!(await isMIS(ctx)) && !isBoss(ctx)) return ctx.answerCbQuery('Only MIS/Boss.');
    await ctx.answerCbQuery();

    const doerId = parseInt(ctx.match[1], 10);
    const doer = await db.Doer.findByPk(doerId);
    if (!doer) return ctx.reply('❌ Employee not found (maybe already removed).');


    // Try to notify the user; ignore failures (400/403/etc.)
    try {
        const chatId = String(doer.telegramId || '').trim();
        if (/^-?\d{5,20}$/.test(chatId)) {
            await ctx.telegram.sendMessage(
                chatId,
                '⚠️ You have been removed from the company database and can no longer use this bot.',
                { parse_mode: 'Markdown' }
            );
        }
    } catch (e) {
        console.warn('DM before removal failed:', e?.response?.description || e.message);
    }

    // Permanently delete
    await doer.destroy();

    // Acknowledge
    return ctx.reply(`🗑️ Removed *${doer.name}* permanently.`, { parse_mode: 'Markdown' });
});

// 5) Cancel action
bot.action('RM_CANCEL', async (ctx) => {
    await ctx.answerCbQuery('Cancelled');
    return ctx.reply('❎ Action cancelled.');
});
















// For EA only if she types /heybot she gets three buttons one to check cancel requests, other is to check extension requests and last it for task preview.
bot.command('heybot', async (ctx) => {
    const chatId = getChatId(ctx);
    if (![ROLES.ea, ROLES.boss].includes(chatId)) {
        return ctx.reply("❌ You are not authorized to access this menu.");
    }
    await ctx.reply(
        "👩‍💼 *EA Control Panel* — Choose an action:",
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('🚫 Cancel Requests', 'EA_CANCEL_REQ')
                ],
                [
                    Markup.button.callback('🔁 Extension Requests', 'EA_EXT_REQ')
                ],
                [
                    Markup.button.callback('📋 Task Preview', 'STATUS')
                ]
            ])
        }
    );
});





bot.action('EA_CANCEL_REQ', async (ctx) => {
    const chatId = getChatId(ctx);

    if (![ROLES.boss, ROLES.ea].includes(chatId)) {
        return ctx.reply("❌ You are not authorized to access cancellation requests.");
    }

    const tasks = await db.Task.findAll({
        where: {
            cancellationRequested: true,
        },
        order: [['updatedAt', 'DESC']],
        limit: 10
    });


    if (!tasks.length) return ctx.reply("📭 No pending cancellation requests.");

    for (const task of tasks) {
        await ctx.replyWithMarkdown(
            `🚫 *Cancellation Requested*\n\n👤 *Doer:* ${task.doer}\n🆔 *Task ID:* ${task.id}\n📝 *Task:* ${task.task}\n✍️ *Reason:* ${task.cancellationReason}`,
            {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Approve Cancel', `CANCEL_APPROVE_${task.id}`)],
                    [Markup.button.callback('❌ Reject Cancel', `CANCEL_REJECT_${task.id}`)]
                ]).reply_markup
            }
        );
    }
});


// ========== 12. EA Approval Handler for Cancellation Request ==========
// EA can approve cancellation: marks as canceled, notifies doer
bot.action(/^CANCEL_APPROVE_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const taskId = parseInt(ctx.match[1]);
    const task = await db.Task.findByPk(taskId);

    if (!task) return ctx.reply("❌ Task not found.");
    if (!task.cancellationRequested) return ctx.reply("⚠️ No cancellation requested.");

    task.status = 'canceled';
    task.cancellationRequested = false;
    await task.save();

    await ctx.reply(`✅ Task ID ${task.id} canceled.`);
    const doer = await db.Doer.findOne({ where: { name: task.doer } });
    if (doer?.telegramId) {
        await bot.telegram.sendMessage(
            doer.telegramId,
            `🚫 Your cancellation request has been *Approved* for task ID ${task.id}.\nTask is now *Canceled*.\n\n📝 *Task:* ${task.task}`,
            { parse_mode: 'Markdown' }
        );
    }
});

// ========== 13. EA Reject Handler for Cancellation Request ==========
// EA can reject cancellation: resets cancellationRequested, notifies doer
bot.action(/^CANCEL_REJECT_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const taskId = parseInt(ctx.match[1]);
    const task = await db.Task.findByPk(taskId);

    if (!task) return ctx.reply("❌ Task not found.");
    if (!task.cancellationRequested) return ctx.reply("⚠️ No cancellation requested.");

    task.cancellationRequested = false;
    await task.save();

    await ctx.reply(`❌ Cancellation rejected for task ID ${task.id}.`);
    const doer = await db.Doer.findOne({ where: { name: task.doer } });
    if (doer?.telegramId) {
        await bot.telegram.sendMessage(
            doer.telegramId,
            `🚩 Your cancellation request has been *Rejected* for task ID ${task.id}.\n\n📝 *Task:* ${task.task}`,
            { parse_mode: 'Markdown' }
        );
    }
});




// First, only EA and Boss can see the extension request and they get the option for APPROVE and REJECT 
bot.action('EA_EXT_REQ', async (ctx) => {
    const chatId = getChatId(ctx);

    if (![ROLES.boss, ROLES.ea].includes(chatId)) {
        return ctx.reply("❌ You are not authorized to access extension requests.");
    }

    const tasks = await db.Task.findAll({
        where: {
            status: ['pending', 'revised'],
            extensionRequestedDate: { [Op.not]: null }
        },
        order: [['updatedAt', 'DESC']],
        limit: 10
    });

    if (!tasks.length) return ctx.reply("📭 No pending extension requests.");

    for (const task of tasks) {
        await ctx.replyWithMarkdown(
            `📄 *Task:* ${task.task}\n👤 *Doer:* ${task.doer}\n🆔 *ID:* ${task.id}\n📅 *Requested Date:* ${task.extensionRequestedDate.toDateString()}`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Approve', `EXT_APPROVE_${task.id}`),
                Markup.button.callback('❌ Reject', `EXT_REJECT_${task.id}`)
            ])
        );
    }
});


// Second, only EA and BOSS can approve the request if they approve, it update the due date to extension date and extension date to null and then status = revised and then notify to the doer that its been approved.
bot.action(/^EXT_APPROVE_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const task = await db.Task.findByPk(taskId);

    if (!task) return ctx.reply("❌ Task not found.");
    if (!task.extensionRequestedDate) return ctx.reply("⚠️ No extension requested for this task.");

    task.dueDate = task.extensionRequestedDate;
    task.status = 'revised'; // 👈 optional
    task.extensionRequestedDate = null;
    await task.save();

    ctx.reply(`✅ Extension approved for task ID ${task.id}.`);

    // Notify doer
    const doer = await db.Doer.findOne({ where: { name: task.doer } });
    if (doer?.telegramId) {
        await bot.telegram.sendMessage(doer.telegramId,
            `✅ *Extension Approved*\n\n📄 ${task.task}\n📅 New Due Date: ${task.dueDate.toDateString()}`,
            { parse_mode: 'Markdown' }
        );
    }
});


// Third, only EA and BOSS can reject the request if they reject, it revert the extension date = null and then  notify to the doer that its been rejected.
bot.action(/^EXT_REJECT_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const task = await db.Task.findByPk(taskId);

    if (!task) return ctx.reply("❌ Task not found.");
    if (!task.extensionRequestedDate) return ctx.reply("⚠️ No extension requested for this task.");

    task.extensionRequestedDate = null;
    await task.save();

    ctx.reply(`❌ Extension rejected for task ID ${task.id}.`);

    // Notify doer
    const doer = await db.Doer.findOne({ where: { name: task.doer } });
    if (doer?.telegramId) {
        await bot.telegram.sendMessage(doer.telegramId,
            `❌ *Extension Request Rejected*\n\n📄 ${task.task}`,
            { parse_mode: 'Markdown' }
        );
    }
});










let taskSession = {};
const broadcastSessions = {};
const broadcastDraft = {}; // Stores the draft for each boss

// Helper: Wipe any existing session for this user
function clearSessions(chatId) {
    delete taskSession[chatId];
    delete broadcastSessions[chatId];
    delete broadcastDraft[chatId];
    delete userSessions[chatId];
}

function escapeMarkdown(text = '') {
    return text.replace(/([_*`\[\]()~>#+\-=|{}.!\\])/g, '\\$1');
}

// Utility to get consistent chat ID
function getChatId(ctx) {
    return ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
}

// 
const showOptions = (ctx) => {
    ctx.reply('Hi Boss! What would you like to do?', Markup.inlineKeyboard([
        [Markup.button.callback('Assign Task', 'ASSIGN')],
        [Markup.button.callback('Check Task Status', 'STATUS')],
        [Markup.button.callback('📢 Broadcast Message', 'BROADCAST')]
    ]));
};

// START BOT
bot.start((ctx) => {
    const chatId = getChatId(ctx);
    clearSessions(chatId);
    if (!isBoss(ctx)) return ctx.reply("❌ You are not allowed to do this.");
    showOptions(ctx);
});


// bot.hears(/^(hi|hello|hey|Hi|Hey|Hello)$/i, showOptions);
bot.hears(/^(hi|hello|hey)$/i, (ctx) => {
    const chatId = getChatId(ctx);
    clearSessions(chatId);
    if (!isBoss(ctx)) return ctx.reply("❌ You are not authorized to send this msg only boss can send this msg.");
    showOptions(ctx);
});




// ASSIGN TASK - SELECT DEPARTMENT

bot.action('ASSIGN', async (ctx) => {
    const chatId = getChatId(ctx);
    clearSessions(chatId);

    if (!isBoss(ctx)) return ctx.reply("❌ Only the Boss can assign tasks.");

    // Get all unique departments from active doers
    const doers = await db.Doer.findAll({ where: { isActive: true } });
    const departments = [...new Set(doers.map(d => d.department))];

    if (!departments.length) {
        ctx.reply("⚠️ No departments with active doers found. Please add them.");
        return showOptions(ctx);
    }

    const buttons = departments.map(dep => [Markup.button.callback(dep, `DEP_${dep}`)]);

    taskSession[chatId] = { step: 'choose_department' };

    ctx.reply('Please select a department:', Markup.inlineKeyboard(buttons));
});



bot.action(/DEP_(.+)/, async (ctx) => {
    if (!isBoss(ctx)) return ctx.reply("❌ Only the Boss can assign tasks.");
    const chatId = getChatId(ctx);

    // Step check
    if (!taskSession[chatId] || taskSession[chatId].step !== 'choose_department') {
        clearSessions(chatId);
        return ctx.reply("⚠️ Please start from the main menu to assign a task.");
    }

    const department = ctx.match[1];

    // Only doers in this department
    const doers = await db.Doer.findAll({ where: { isActive: true, department } });
    if (!doers.length) {
        clearSessions(chatId);
        ctx.reply(`⚠️ No doers found in department: ${department}.`);
        return showOptions(ctx);
    }

    const buttons = doers.map(d => [Markup.button.callback(d.name, `DOER_${d.id}`)]);

    taskSession[chatId] = { step: 'choose_doer', department };

    ctx.reply(`Select a doer from *${escapeMarkdown(department)}*:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});




// HANDLE DOER SELECTED
bot.action(/DOER_(\d+)/, async (ctx) => {

    if (!isBoss(ctx)) return ctx.reply("❌ Only the Boss can assign tasks.");

    const chatId = getChatId(ctx);

    // Step check
    if (!taskSession[chatId] || taskSession[chatId].step !== 'choose_doer') {
        clearSessions(chatId);
        return ctx.reply("⚠️ Please start from the main menu to assign a task.");
    }

    const doerId = parseInt(ctx.match[1]);
    const doer = await db.Doer.findByPk(doerId);

    if (!doer) return ctx.reply("❌ Doer not found.");

    taskSession[chatId] = {
        ...taskSession[chatId],
        step: 'waiting_task', // <--- Next step is typing the task
        doerName: doer.name,
        doerId: doer.id,
        doerTelegramId: doer.telegramId
    };

    ctx.reply(`Great! Now type the task for ${doer.name}:`);
});


// HANDLE TEXT INPUT (TASK )
bot.on('text', async (ctx, next) => {
    if (!isBoss(ctx)) {
        ctx.reply("❌ Only the Boss can perform this action.");
        return showDoerHelp(ctx);
    }
    const chatId = getChatId(ctx);
    const session = taskSession[chatId];

    if (!session || session.step !== 'waiting_task') return next();

    // Handle input as the task description

    session.task = ctx.message.text;
    session.step = 'waiting_urgency'; // <--- Next step

    ctx.reply('Set urgency or due date:', Markup.inlineKeyboard([
        [Markup.button.callback('Now Now (Urgent)', 'URGENT')],
        [Markup.button.callback('Completed By (Pick Date)', 'DATE')]
    ]));
});




bot.action('DATE', async (ctx) => {
    const chatId = getChatId(ctx);
    const session = taskSession[chatId];
    if (!session || session.step !== 'waiting_urgency') {
        clearSessions(chatId);
        return ctx.reply("⚠️ Unexpected action. Please start from main menu.");
    }
    session.step = 'waiting_due_date';
    ctx.reply("Please type the due date (YYYY-MM-DD):");
});



// HANDLE TEXT INPUT (DUE DATE)
bot.on('text', async (ctx, next) => {
    const chatId = getChatId(ctx);
    const session = taskSession[chatId];
    if (!session || session.step !== 'waiting_due_date') return next();

    const input = ctx.message.text.trim();

    // Validate YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return ctx.reply("⚠️ *Invalid format.*\nPlease type the due date as YYYY-MM-DD (e.g. 2024-07-15).", { parse_mode: 'Markdown' });
    }

    const [year, month, day] = input.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    // Validate date is real (not 2024-02-30 etc)
    if (
        isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return ctx.reply("⚠️ *Invalid date.* Please enter a real date as YYYY-MM-DD.", { parse_mode: 'Markdown' });
    }

    // Validate date is today or future
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Only compare date part
    if (date < today) {
        return ctx.reply("⚠️ *Date is in the past.* Please enter today or a future date.", { parse_mode: 'Markdown' });
    }

    // Valid date!
    session.dueDate = date; // You may want to store the actual Date object
    session.urgency = 'scheduled';
    session.step = 'review_task';
    showReviewOptions(ctx, session);
});



// URGENT SELECTED
// When Boss chooses urgent
bot.action('URGENT', (ctx) => {
    if (!isBoss(ctx)) return ctx.reply("❌ Only the Boss can perform this action.");


    const chatId = getChatId(ctx);
    const session = taskSession[chatId];

    if (!session || session.step !== 'waiting_urgency') {
        clearSessions(chatId);
        return ctx.reply("⚠️ Unexpected action. Please start from main menu.");
    }
    session.urgency = 'urgent';
    session.dueDate = null;
    session.step = 'review_task';
    showReviewOptions(ctx, session);
});



// SHOW PREVIEW
function showReviewOptions(ctx, session) {
    const message = `📝 *Task Assignment Summary*

───────────────
👤 *Assigned To:*   ${session.doerName}

🧾 *Task Description:* 
${session.task}

⚡ *Urgency Level:* ${session.urgency}

📅 *Deadline:*  ${session.dueDate ? session.dueDate.toDateString() : 'ASAP'}
───────────────

Please review the task details carefully before proceeding.`;

    ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Edit Task', 'EDIT')],
            [Markup.button.callback('✅ Confirm & Send', 'SEND')]
        ])
    });
}





// EDIT TASK
bot.action('EDIT', (ctx) => {
    if (!isBoss(ctx)) return ctx.reply("❌ Only the Boss can perform this action.");


    const chatId = getChatId(ctx);
    const session = taskSession[chatId];

    if (!session || session.step !== 'review_task') {
        clearSessions(chatId);
        return ctx.reply("⚠️ Cannot edit right now. Please restart from main menu.");
    }
    delete session.task;
    session.step = 'waiting_task';
    ctx.reply(
        `Editing task for: ${escapeMarkdown(session.doerName)}\nPlease retype the task:`,
        { parse_mode: 'Markdown' }
    );
});



// SEND TASK TO DB
bot.action('SEND', async (ctx) => {

    if (!isBoss(ctx)) return ctx.reply("❌ Only the Boss can perform this action.");


    const chatId = getChatId(ctx);
    const session = taskSession[chatId];

    if (!session || session.step !== 'review_task' || !session.task) {
        clearSessions(chatId);
        return ctx.reply("❌ No task to send or not ready for sending. Please restart.");
    }

    const newTask = await db.Task.create({
        task: session.task,
        doer: session.doerName,
        urgency: session.urgency,
        dueDate: session.dueDate,
        department: session.department
    });

    ctx.reply(`✅ Task sent to ${session.doerName} successfully!`);

    // 🛎 Notify the doer on Telegram
    if (session.doerTelegramId) {
        try {
            const taskId = newTask.id;
            await bot.telegram.sendMessage(
                session.doerTelegramId,
                `📥 *You Have a New Task Assigned!*

━━━━━━━━━━━━━━━━━━
🧾 *Task:*  
${session.task}

⚡ *Urgency:* ${session.urgency}

📅 *Due Date:* ${session.dueDate ? session.dueDate.toDateString() : 'ASAP'}
━━━━━━━━━━━━━━━━━━

Please take appropriate action below if required.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🗓️ Request Extension', callback_data: `TASK_EXT_${newTask.id}` },
                            ],
                            [
                                { text: '🚫 Request Cancellation', callback_data: `TASK_CANCEL_${newTask.id}` }
                            ]
                        ]
                    }
                }
            );
        } catch (err) {
            console.log("❌ Failed to notify doer:", err.message);
        }
    } else {
        ctx.reply(`⚠️ Could not notify ${session.doerName} — Telegram ID is missing.`);
    }


    // Notify EA for follow-up
    try {
        if (ROLES.ea !== session.doerTelegramId) {
            await bot.telegram.sendMessage(ROLES.ea,
                `🧾 *Follow-up Task Alert (EA)*\n\n👤 Doer: ${session.doerName}\n📄 Task: ${session.task}\n⏱️ ${session.urgency}\n📅 ${session.dueDate ? session.dueDate.toDateString() : 'ASAP'}`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (err) {
        console.log("❌ Failed to notify EA:", err.message);
    }


    // Ask if boss wants to add another task for the same doer
    session.step = 'add_another_task';
    ctx.reply(
        `➕ Do you want to assign another task to ${escapeMarkdown(session.doerName)}?`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Yes', 'ADD_ANOTHER_YES')],
                [Markup.button.callback('No', 'ADD_ANOTHER_NO')]
            ])
        }
    );
});



bot.action('ADD_ANOTHER_YES', (ctx) => {
    const chatId = getChatId(ctx);
    const session = taskSession[chatId];

    if (!session || session.step !== 'add_another_task') {
        clearSessions(chatId);
        return ctx.reply("⚠️ No ongoing task assignment. Please start from the main menu.");
    }

    // Start a new task assignment for the SAME doer
    delete session.task;
    delete session.urgency;
    delete session.dueDate;
    session.step = 'waiting_task';

    ctx.reply(
        `Great! Type the next task for ${escapeMarkdown(session.doerName)}:`,
        { parse_mode: 'Markdown' }
    );
});

bot.action('ADD_ANOTHER_NO', (ctx) => {
    const chatId = getChatId(ctx);
    const session = taskSession[chatId];

    if (!session || session.step !== 'add_another_task') {
        clearSessions(chatId);
        return ctx.reply("⚠️ No ongoing task assignment. Please start from the main menu.");
    }

    clearSessions(chatId);
    ctx.reply("✅ Done! All tasks assigned. Returning to main menu.");
    showOptions(ctx);
});










bot.action('STATUS', async (ctx) => {
    const chatId = getChatId(ctx);
    clearSessions(chatId);
    if (![ROLES.ea, ROLES.boss].includes(chatId)) {
        return ctx.reply("❌ You are not authorized to access this menu.");
    }

    ctx.reply("📋 Select the task status you want to view:", Markup.inlineKeyboard([
        [Markup.button.callback('📌 Pending', 'STATUS_PENDING')],
        [Markup.button.callback('✅ Completed', 'STATUS_COMPLETED')],
        [Markup.button.callback('🔁 Revised', 'STATUS_REVISED')],
        [Markup.button.callback('❌ Cancelled', 'STATUS_CANCELLED')]
    ]));
});



//  Pending Tasks

bot.action('STATUS_PENDING', async (ctx) => {

    const chatId = getChatId(ctx);

    if (![ROLES.ea, ROLES.boss].includes(chatId)) {
        return ctx.reply("❌ You are not authorized to access this menu.");
    }

    const tasks = await db.Task.findAll({
        where: { status: 'pending' },
        order: [
            [sequelize.literal(`CASE WHEN urgency = 'urgent' THEN 0 ELSE 1 END`), 'ASC'],
            ['createdAt', 'DESC']
        ],
        limit: 10
    });

    if (!tasks.length) return ctx.reply("✅ No pending tasks.");

    const msg = tasks.map((t, i) =>
        `📝 *Task ${i + 1}*\n━━━━━━━━━━━━━━\n` +
        `👤 *Assigned To:* ${t.doer}\n` +
        `📄 *Description:* ${t.task}\n` +
        `📅 *Due Date:* ${t.dueDate ? new Date(t.dueDate).toDateString() : 'ASAP'}\n`
    ).join('\n\n');

    ctx.reply(`🟡 *Pending Tasks (Latest 10)*\n\n${msg}`, { parse_mode: 'Markdown' });
});


// 🟢 Completed Tasks
bot.action('STATUS_COMPLETED', async (ctx) => {

    const chatId = getChatId(ctx);

    if (![ROLES.ea, ROLES.boss].includes(chatId)) {
        return ctx.reply("❌ You are not authorized to access this menu.");
    }

    const tasks = await db.Task.findAll({
        where: { status: 'completed' },
        order: [['updatedAt', 'DESC']],
        limit: 10
    });

    if (!tasks.length) return ctx.reply("📭 No completed tasks.");

    const msg = tasks.map((t, i) => {
        return (
            `✅ *Task ${i + 1}*\n━━━━━━━━━━━━━━\n` +
            `👤 *Completed By:* ${t.doer}\n` +
            `📄 *Task:* ${t.task}\n` +
            `📅 *Completed On:* ${t.dueDate ? new Date(t.dueDate).toDateString() : 'ASAP'}\n`
        );
    }).join('\n\n');

    ctx.reply(`🟢 *Recently Completed Tasks (Top 10)*\n\n${msg}`, {
        parse_mode: 'Markdown'
    });
});

// Revised Tasks (due date extended)
bot.action('STATUS_REVISED', async (ctx) => {

    const chatId = getChatId(ctx);

    if (![ROLES.ea, ROLES.boss].includes(chatId)) {
        return ctx.reply("❌ You are not authorized to access this menu.");
    }

    const tasks = await db.Task.findAll({
        where: {
            status: 'revised'  // 👈 direct status match
        },
        order: [
            [sequelize.literal(`CASE WHEN urgency = 'urgent' THEN 0 ELSE 1 END`), 'ASC'],
            ['updatedAt', 'DESC']
        ],
        limit: 10
    });

    if (!tasks.length) return ctx.reply("🔁 No revised tasks found.");

    const msg = tasks.map((t, i) => {
        return (
            `🔁 *Task ${i + 1}*\n━━━━━━━━━━━━━━\n` +
            `👤 *Assigned To:* ${t.doer}\n` +
            `📄 *Task:* ${t.task}\n` +
            `📅 *Revised Due Date:* ${t.dueDate ? new Date(t.dueDate).toDateString() : 'ASAP'}\n`
        );
    }).join('\n\n');

    ctx.reply(`🔁 *Revised Tasks (Top 10)*\n\n${msg}`, {
        parse_mode: 'Markdown'
    });
});


bot.action('STATUS_CANCELLED', async (ctx) => {
    const chatId = getChatId(ctx);

    if (![ROLES.ea, ROLES.boss].includes(chatId)) {
        return ctx.reply("❌ You are not authorized to access this menu.");
    }

    const tasks = await db.Task.findAll({
        where: { status: 'canceled' },  // direct match
        order: [
            [sequelize.literal(`CASE WHEN urgency = 'urgent' THEN 0 ELSE 1 END`), 'ASC'],
            ['updatedAt', 'DESC']
        ],
        limit: 10
    });

    if (!tasks.length) return ctx.reply("❌ No cancelled tasks found.");

    const msg = tasks.map((t, i) => {
        return (
            `❌ *Task ${i + 1}*\n━━━━━━━━━━━━━━\n` +
            `👤 *Doer:* ${t.doer}\n` +
            `📄 *Task:* ${t.task}\n` +
            `📅 *Due Date:* ${t.dueDate ? new Date(t.dueDate).toDateString() : 'ASAP'}`
        );
    }).join('\n\n');

    ctx.reply(`❌ *Cancelled Tasks (Top 10)*\n\n${msg}`, {
        parse_mode: 'Markdown'
    });
});



// BROADCAST SESSION CODE


bot.action('BROADCAST', async (ctx) => {
    const chatId = getChatId(ctx);
    clearSessions(chatId);
    if (chatId !== ROLES.boss) {
        return ctx.reply('❌ Only Boss can broadcast messages.');
    }
    broadcastSessions[chatId] = true;
    await ctx.reply('📝 Please type the message you want to broadcast to all Doers:');
});


// When boss types the message:
bot.on('text', async (ctx, next) => {
    const chatId = getChatId(ctx);

    // Only for broadcast mode
    if (!broadcastSessions[chatId]) return next();

    const message = ctx.message.text;
    broadcastDraft[chatId] = message; // Save the draft

    // Show confirmation buttons
    await ctx.reply(
        `📝 *Preview your message:*\n\n${message}\n\nSend to all doers?`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Send', 'BROADCAST_SEND')],
                [Markup.button.callback('❌ Cancel', 'BROADCAST_CANCEL')]
            ])
        }
    );
    // End broadcast mode, but wait for confirmation
    broadcastSessions[chatId] = false;
});


bot.action('BROADCAST_SEND', async (ctx) => {
    const chatId = getChatId(ctx);
    const message = broadcastDraft[chatId];

    if (ctx.chat.id !== ROLES.boss || !message) {
        return ctx.reply('❌ No message to send.');
    }

    const doers = await db.Doer.findAll({ where: { telegramId: { [Op.not]: null } } });

    for (const doer of doers) {
        try {
            await bot.telegram.sendMessage(
                doer.telegramId,
                `📢 *Message from Boss:*\n\n${message}`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error(`❌ Failed to message doer ${doer.name}:`, e);
        }
    }

    await ctx.reply('✅ Broadcast sent to all doers!');
    clearSessions((chatId))
});

bot.action('BROADCAST_CANCEL', async (ctx) => {
    const chatId = getChatId(ctx);

    await ctx.reply('❌ Broadcast cancelled.');
    clearSessions(chatId);
});





bot.on('text', (ctx) => {
    const chatId = getChatId(ctx);

    // Check if it's already handled by session or expected flow
    if (ctx.session?.step || registrationSession[chatId]) {
        return; // Let other flows continue
    }

    if (isBoss(ctx)) {
        showBossHelp(ctx);
    } else {
        showDoerHelp(ctx);
    }
});


function showDoerHelp(ctx) {
    ctx.reply(
        `👤 *Available Commands for You:*\n` + "\n" +
        `/register - Register yourself, update department or change department\n` + "\n" +
        `/tasks - View your tasks\n` + "\n" +
        `/misControl - Only MIS or Boss can access it.\n` + "\n" +
        `/heybot - For EA to follow up\n` + "\n" +
        `/help - Show this menu`,
        { parse_mode: 'Markdown' }
    );
}

function showBossHelp(ctx) {
    ctx.reply(
        `👑 *Boss Commands:*\n` + "\n" +
        `/start - Open main menu\n` + "\n" +
        `/heybot - Access EA control panel\n` + "\n" +
        `/misControl - Access MIS commands\n` + "\n" +
        `/help - Show this menu`,
        { parse_mode: 'Markdown' }
    );
}


bot.command('help', (ctx) => {
    if (isBoss(ctx)) {
        showBossHelp(ctx);
    } else {
        showDoerHelp(ctx);
    }
});




export default bot;
















// const { Scenes, session } from 'telegraf');

// const stepHandler = new Scenes.WizardScene(
//   'my-wizard',
//   (ctx) => {
//     ctx.reply('Step 1');
//     return ctx.wizard.next();
//   },
//   (ctx) => {
//     ctx.reply('Step 2');
//     return ctx.wizard.next();
//   },
//   (ctx) => {
//     ctx.reply('Finished!');
//     return ctx.scene.leave();
//   }
// );

// const stage = new Scenes.Stage([stepHandler]);
// bot.use(session());
// bot.use(stage.middleware());

// bot.command('wizard', (ctx) => ctx.scene.enter('my-wizard'));


