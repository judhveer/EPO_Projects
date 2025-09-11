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
import bot from "./utils/attendance/bot.js";
import { sendTelegramMessage } from "./utils/attendance/telegram.js";
import {Op} from "sequelize";




// salespipeline routes

import researchRoutes from './routes/salesPipeline/researchRoutes.js';
import approvalRoutes from './routes/salesPipeline/approvalRoutes.js';
import telecallRoutes from './routes/salesPipeline/telecallRoutes.js';
import meetingRoutes from './routes/salesPipeline/meetingRoutes.js';
import crmRoutes from './routes/salesPipeline/crmRoutes.js';
import leadRoutes from './routes/salesPipeline/leadRoutes.js';

import notFound from './middlewares/salesPipeline/notFound.js';
import errorHandler from './middlewares/salesPipeline/error.js';



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



// error handling middlewares
app.use(notFound);
app.use(errorHandler);


app.get('/health', (req, res) => res.json({ ok: true }));


export async function init() {
  try{
    await models.sequelize.authenticate();
    await models.sequelize.sync({ alter: true }); // dev only
  
    await bot.telegram.deleteWebhook();
    bot.launch();
    // start bot
    console.log("Bot is running");
  }
  catch(err){
    console.error("Failed to initialize application:", err);
    process.exit(1);
  }

  return app;
}



process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

export default app;