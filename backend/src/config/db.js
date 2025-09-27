import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();


console.log("process.env ", process.env.DB_NAME);

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 120000,
      idle: 10000
    },
    dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}
  }
);