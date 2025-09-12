process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});



import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import models from './models/index.js';
import axios from 'axios';
dotenv.config();

// Attendance imports
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
import attendanceBot from "./utils/attendance/bot.js";
import { sendTelegramMessage } from "./utils/attendance/telegram.js";
import { Op } from "sequelize";


// taskbot imports
import taskRoutes from './routes/TaskBot/taskRoutes.js';
import taskBot from './controllers/taskbotController/bot.js';




// salespipeline routes

import researchRoutes from './routes/SalesPipeline/researchRoutes.js';
import approvalRoutes from './routes/SalesPipeline/approvalRoutes.js';
import telecallRoutes from './routes/SalesPipeline/telecallRoutes.js';
import meetingRoutes from './routes/SalesPipeline/meetingRoutes.js';
import crmRoutes from './routes/SalesPipeline/crmRoutes.js';
import leadRoutes from './routes/SalesPipeline/leadRoutes.js';

import notFound from './middlewares/SalesPipeline/notFound.js';
import errorHandler from './middlewares/SalesPipeline/error.js';



// Attendance routes
import attendanceRoutes from './routes/Attendance/attendance.js';




const app = express();


app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));


// salespipeline route define
app.use('/api/sales/research', researchRoutes);
app.use('/api/sales/approval', approvalRoutes);
app.use('/api/sales/telecall', telecallRoutes);
app.use('/api/sales/meeting', meetingRoutes);
app.use('/api/sales/crm', crmRoutes);
app.use('/api/sales/leads', leadRoutes);


// Attendance route define
app.use('/api/attendance', attendanceRoutes);
import { startWeeklyReportJob } from './jobs/attendance/scheduleWeeklyReport.js';
startWeeklyReportJob();
import { startMonthlyReportJob } from './jobs/attendance/scheduleMonthlyReport.js';
startMonthlyReportJob();
import { startAccountantMonthlyReportJob } from './jobs/attendance/scheduleAccountantMonthlyReport.js';
startAccountantMonthlyReportJob();



// taskbot route define
// Mount the route
app.use('/api/tasks', taskRoutes);



// error handling middlewares
app.use(notFound);
app.use(errorHandler);


app.get('/health', (req, res) => res.json({ ok: true }));


function assertEnv() {
  const a = process.env.TELEGRAM_TOKEN;
  const t = process.env.BOT_TOKEN;
  if (!a || !t) throw new Error("Missing ATTENDANCE_BOT_TOKEN or TASK_BOT_TOKEN");
  if (a === t) throw new Error("Both bots share the same token — use separate tokens or merge handlers into one bot.");
}


export async function init() {
  try {
    assertEnv();
    await models.sequelize.authenticate();
    await models.sequelize.sync({ alter: true }); // dev only

    await attendanceBot.telegram.deleteWebhook();
    await taskBot.telegram.deleteWebhook();

    await attendanceBot.launch({ dropPendingUpdates: true });
    console.log("Attendance bot is running");


    await taskBot.launch({ dropPendingUpdates: true });
    console.log("Task bot is running");
  }
  catch (err) {
    console.error("Failed to initialize application:", err);
    process.exit(1);
  }

  return app;
}



process.once('SIGINT',  () => { attendanceBot.stop('SIGINT'); taskBot.stop('SIGINT'); });
process.once('SIGTERM', () => { attendanceBot.stop('SIGTERM'); taskBot.stop('SIGTERM'); });

export default app;