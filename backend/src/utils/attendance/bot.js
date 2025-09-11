import { Telegraf } from 'telegraf';
import db  from '../../models/index.js';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);


bot.command('register', async (ctx) => {
    try {
        console.log("register is called");
        const chat_id = ctx.chat.id;
        const fullName = `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim().toUpperCase();

        const user = await db.TelegramUser.findOne({
            where: {
                name: fullName
            }
        });

        if (!user) {
            ctx.reply(`❌ Your name "${fullName}" is not found in the system. Please contact admin to add you.`);
        } else if (user.chat_id) {
            ctx.reply("✅ You are already registered.");
        }
        else {
            user.chat_id = chat_id
            await user.save();
            ctx.reply(`✅ ${fullName}, you are now registered with Telegram ID.`);
        }
    }
    catch (error) {
        console.error("❌ Register error:", error);
        ctx.reply("⚠️ Registration failed. Please try again or contact support.");
    }
});




export default bot;
