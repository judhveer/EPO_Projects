// process.on('uncaughtException', (err) => {
//   console.error('Uncaught Exception:', err);
// });
// process.on('unhandledRejection', (reason, promise) => {
//   console.error('Unhandled Rejection:', reason);
// });



import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import models from './models/index.js';
import axios from 'axios';
dotenv.config();


// salespipeline routes

import researchRoutes from './routes/salesPipeline/researchRoutes.js';
import approvalRoutes from './routes/salesPipeline/approvalRoutes.js';
import telecallRoutes from './routes/salesPipeline/telecallRoutes.js';
import meetingRoutes from './routes/salesPipeline/meetingRoutes.js';
import crmRoutes from './routes/salesPipeline/crmRoutes.js';
import leadRoutes from './routes/salesPipeline/leadRoutes.js';

import notFound from './middlewares/salesPipeline/notFound.js';
import errorHandler from './middlewares/salesPipeline/error.js';




const app = express();


app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));


// salespipeline route define
app.use('/api/research', researchRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/telecall', telecallRoutes);
app.use('/api/meeting', meetingRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/leads', leadRoutes);


app.use(notFound);
app.use(errorHandler);


app.get('/health', (req, res) => res.json({ ok: true }));


export async function init() {
  await models.sequelize.authenticate();
  await models.sequelize.sync({ alter: true }); // dev only
  return app;
}

export default app;