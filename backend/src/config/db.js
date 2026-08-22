import { Sequelize } from 'sequelize';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();


const dialectOptions = {};

// if (fs.existsSync(caPath)) {
//   dialectOptions.ssl = {
//     ca: fs.readFileSync(caPath, 'utf8'),
//     rejectUnauthorized: true
//   };
// }

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    timezone: "+05:30",
    dialect: 'mysql',
    dialectOptions: {
      connectTimeout: 20000, // give the handshake more room before giving up
    },
    logging: false,
    // pool: {
    //   max: 30,        
    //   min: 5,
    //   acquire: 60000, // wait time before timeout
    //   idle: 10000,
    // },
    pool: {
      max: 15,      // room to grow beyond the default 5 under load
      min: 2,       // keep a couple of warm connections instead of 0
      acquire: 30000,
      idle: 10000,
    },
    retry: {
      max: 3,       // retry transient connection errors automatically
      match: [/ETIMEDOUT/, /ECONNRESET/, /SequelizeConnectionError/],
    },
  }
);




