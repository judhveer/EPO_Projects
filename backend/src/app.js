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
// import { Op } from "sequelize";
// import axios from 'axios';
// const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
dotenv.config();


// --- NEW: Auth middleware & routes ---
import authenticate from './middlewares/authenticate.js';
import { requirePermission } from './middlewares/authorize.js';
import authRoutes from './routes/auth.js';



// salespipeline routes
import researchRoutes from './routes/SalesPipeline/researchRoutes.js';
import approvalRoutes from './routes/SalesPipeline/approvalRoutes.js';
import telecallRoutes from './routes/SalesPipeline/telecallRoutes.js';
import meetingRoutes from './routes/SalesPipeline/meetingRoutes.js';
import crmRoutes from './routes/SalesPipeline/crmRoutes.js';
import leadRoutes from './routes/SalesPipeline/leadRoutes.js';
import notFound from './middlewares/SalesPipeline/notFound.js';
import errorHandler from './middlewares/SalesPipeline/error.js';



// Attendance routes // Attendance imports
import attendanceRoutes from './routes/Attendance/attendance.js';
import attendanceBot from "./utils/attendance/bot.js";



// taskbot imports
import taskRoutes from './routes/TaskBot/taskRoutes.js';
import taskBot from './controllers/taskbotController/bot.js';


// Attendance jobs
import { startWeeklyReportJob } from './jobs/attendance/scheduleWeeklyReport.js';
import { startMonthlyReportJob } from './jobs/attendance/scheduleMonthlyReport.js';
import { startAccountantMonthlyReportJob } from './jobs/attendance/scheduleAccountantMonthlyReport.js';
import { AttendanceSyncAll } from './jobs/attendance/syncAllData.js';


const app = express();
app.use(helmet());
// app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));


const raw = process.env.CORS_ORIGIN || ''; // comma-separated
const ALLOWLIST = raw.split(',').map(s => s.trim()).filter(Boolean);

// allow patterns for common tunnels (so you don't have to change env daily)
const TUNNEL_SUFFIXES = [
  '.devtunnels.ms',     // VS Code / Azure dev tunnels
  '.ngrok.io',
  '.trycloudflare.com',
  '.githubpreview.dev',
  '.app.github.dev',
];

function isAllowedOrigin(origin) {
  if (!origin) return true;                           // curl/Postman/mobile apps
  if (ALLOWLIST.includes(origin)) return true;        // exact match
  return TUNNEL_SUFFIXES.some(sfx => origin.endsWith(sfx)); // tunnel wildcard
}

app.use(cors({
  origin(origin, cb) {
    cb(null, isAllowedOrigin(origin));
  },
  credentials: true, // required if you ever send cookies/Authorization with XHR
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
}));

// Ensure preflight always answers
// app.options('*', cors());





app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ---------- NEW: helper to gate per method ----------
// GET/HEAD/OPTIONS => permView, others => permMutate (fallback to permView if mutate not provided)
const gateByMethod = (permView, permMutate = null) => [
  authenticate,
  (req, res, next) => {
    const isRead = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    const perm = isRead ? permView : (permMutate || permView);
    return requirePermission(perm)(req, res, next);
  }
];


app.use('/api/auth', authRoutes);        // POST /api/auth/login, POST /api/auth/users, GET /api/auth/me




// salespipeline route define
app.use('/api/sales/research',
  ...gateByMethod('sales.research.view', 'sales.research.mutate'),
  researchRoutes
);
app.use('/api/sales/approval',
  ...gateByMethod('sales.approval.view', 'sales.approval.mutate'),
  approvalRoutes
);
app.use('/api/sales/telecall',
  ...gateByMethod('sales.telecall.view', 'sales.telecall.mutate'),
  telecallRoutes
);
app.use('/api/sales/meeting',
  ...gateByMethod('sales.meeting.view', 'sales.meeting.mutate'),
  meetingRoutes
);
app.use('/api/sales/crm',
  ...gateByMethod('sales.crm.view', 'sales.crm.mutate'),
  crmRoutes
);
app.use('/api/sales/leads',
  authenticate,
  requirePermission('sales.dashboard.view'),
  leadRoutes
);


// Attendance route define
app.use('/api/attendance',
  // authenticate,
  // requirePermission('attendance.view'),
  attendanceRoutes
);




// taskbot route define
// Mount the route
app.use('/api/tasks',
  authenticate,
  requirePermission('ea.dashboard.view'), taskRoutes);




// function assertEnv() {
//   const a = process.env.TELEGRAM_TOKEN;
//   const t = process.env.BOT_TOKEN;
//   if (!a || !t) throw new Error("Missing ATTENDANCE_BOT_TOKEN or TASK_BOT_TOKEN");
//   if (a === t) throw new Error("Both bots share the same token — use separate tokens or merge handlers into one bot.");
// }

startWeeklyReportJob();
startMonthlyReportJob();
startAccountantMonthlyReportJob();
AttendanceSyncAll();


app.get('/health', (req, res) => res.json({ ok: true }));


// error handling middlewares
app.use(notFound);
app.use(errorHandler);



let attendanceBotRunning = false;
let taskBotRunning = false;

export async function init() {
  try {
    // assertEnv();
    await models.sequelize.authenticate();
    await models.sequelize.sync({ alter: false }); // dev only
    console.log("DB sync successful");

    // await attendanceBot.telegram.deleteWebhook();
    await taskBot.telegram.deleteWebhook();

    // await attendanceBot.launch({ dropPendingUpdates: true });
    // console.log("Attendance bot is running");
    // attendanceBotRunning = true;

    taskBot.launch();
    console.log("Task bot is running");
    taskBotRunning = true;
  }
  catch (err) {
    console.error("Failed to initialize application:", err);
    process.exit(1);
  }

  return app;
}

export default app;



// Stop safely
process.once('SIGINT', () => {
  if (attendanceBotRunning) attendanceBot.stop('SIGINT');
  if (taskBotRunning) taskBot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  if (attendanceBotRunning) attendanceBot.stop('SIGTERM');
  if (taskBotRunning) taskBot.stop('SIGTERM');
});