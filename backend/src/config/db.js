import { Sequelize } from 'sequelize';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const { DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT, MYSQL_CA } = process.env;

let caPath;
if (MYSQL_CA) {
  const certDir = path.join(process.cwd(), 'certs');
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
  caPath = path.join(certDir, 'ca.pem');
  const current = fs.existsSync(caPath) ? fs.readFileSync(caPath,'utf8') : null;
  if (current !== MYSQL_CA) fs.writeFileSync(caPath, MYSQL_CA, { mode: 0o600 });
}

export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  port: Number(DB_PORT || 3306),
  dialect: 'mysql',
  dialectOptions: caPath ? { ssl: { ca: fs.readFileSync(caPath,'utf8'), rejectUnauthorized: true } } : {},
  logging: false,
  pool: { max: 5, min: 0, acquire: 120000, idle: 10000 }
});
