
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import models from './models/index.js';
import fs from 'fs';
import path from 'path';
// import { Op } from "sequelize";
// import axios from 'axios';
// const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;


// --- NEW: Auth middleware & routes ---
import authenticate from './middlewares/authenticate.js';
import { requirePermission } from './middlewares/authorize.js';
import authRoutes from './routes/auth.js';



// salespipeline routes
import researchRoutes from './routes/salesPipeline/researchRoutes.js';
import approvalRoutes from './routes/salesPipeline/approvalRoutes.js';
import telecallRoutes from './routes/salesPipeline/telecallRoutes.js';
import meetingRoutes from './routes/salesPipeline/meetingRoutes.js';
import crmRoutes from './routes/salesPipeline/crmRoutes.js';
import leadRoutes from './routes/salesPipeline/leadRoutes.js';
import notFound from './middlewares/salesPipeline/notFound.js';
import errorHandler from './middlewares/salesPipeline/error.js';



// Attendance routes // Attendance imports
import attendanceRoutes from './routes/attendance/attendance.js';
import attendanceBot from "./utils/attendance/bot.js";



// taskbot imports
import taskRoutes from './routes/taskBot/taskRoutes.js';
import taskBot from './controllers/taskbotController/bot.js';


// Attendance jobs
import { startWeeklyReportJob } from './jobs/attendance/scheduleWeeklyReport.js';
import { startMonthlyReportJob } from './jobs/attendance/scheduleMonthlyReport.js';
import { startAccountantMonthlyReportJob } from './jobs/attendance/scheduleAccountantMonthlyReport.js';
import { AttendanceSyncAll } from './jobs/attendance/syncAllData.js';

dotenv.config();



// --- Database CA setup (for Aiven MySQL) ---
const { MYSQL_CA } = process.env;
let caPath;
if (MYSQL_CA) {
  const certDir = path.join(process.cwd(), 'certs');
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true, mode: 0o700 });
  caPath = path.join(certDir, 'ca.pem');

  const current = fs.existsSync(caPath) ? fs.readFileSync(caPath, 'utf8') : null;
  if (current !== MYSQL_CA) fs.writeFileSync(caPath, MYSQL_CA, { mode: 0o600 });
}


const app = express();
app.use(helmet());

app.use(cors({
  origin: '*', // change to frontend URL in production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(express.static('dist'));


// ---------- NEW: helper to gate per method ----------
// GET/HEAD/OPTIONS => permView, others => permMutate (fallback to permView if mutate not provided)
// ---------- Gate by HTTP method ----------
const gateByMethod = (permView, permMutate = null) => [
  authenticate,
  (req, res, next) => {
    const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
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


// error handling middlewares
app.use(notFound);
app.use(errorHandler);

// --- Bot & Scheduler Flags ---
let attendanceBotRunning = false;
let taskBotRunning = false;


// function assertEnv() {
//   const a = process.env.TELEGRAM_TOKEN;
//   const t = process.env.BOT_TOKEN;
//   if (!a || !t) throw new Error("Missing ATTENDANCE_BOT_TOKEN or TASK_BOT_TOKEN");
//   if (a === t) throw new Error("Both bots share the same token — use separate tokens or merge handlers into one bot.");
// }

export async function init() {
  try {
    // assertEnv();
    await models.sequelize.authenticate();
    await models.sequelize.sync({ force: false }); // dev only
    console.log("DB sync successful");

    // await attendanceBot.telegram.deleteWebhook();
    await taskBot.telegram.deleteWebhook();

    // await attendanceBot.launch({ dropPendingUpdates: true });
    // console.log("Attendance bot is running");
    // attendanceBotRunning = true;

    taskBot.launch();
    console.log("Task bot is running");
    taskBotRunning = true;

    startWeeklyReportJob();
    startMonthlyReportJob();
    startAccountantMonthlyReportJob();
    AttendanceSyncAll();

  }
  catch (err) {
    console.error("Failed to initialize application:", err);
    process.exit(1);
  }

  return app;
}


app.get('/health', (req, res) => res.json({ ok: true }));


// Stop safely
process.once('SIGINT', () => {
  if (attendanceBotRunning) attendanceBot.stop('SIGINT');
  if (taskBotRunning) taskBot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  if (attendanceBotRunning) attendanceBot.stop('SIGTERM');
  if (taskBotRunning) taskBot.stop('SIGTERM');
});


export default app;