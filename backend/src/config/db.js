import { Sequelize } from 'sequelize';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();


const caPath = process.env.DB_CERT;
console.log("caPath, ", caPath);
const dialectOptions = {};

if (fs.existsSync(caPath)) {
  dialectOptions.ssl = {
    ca: fs.readFileSync(caPath, 'utf8'),
    rejectUnauthorized: true
  };
}

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    dialectOptions,
    logging: false,
  }
);
