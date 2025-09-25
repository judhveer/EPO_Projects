import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const {
  DB_NAME,
  DB_USER,
  DB_PASS,
  DB_HOST,
  DB_PORT,
  MYSQL_CA
} = process.env;

// Write CA file at runtime (if MYSQL_CA exists)
let caPath;
if (MYSQL_CA) {
  const certDir = path.join(process.cwd(), 'certs');
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true, mode: 0o700 });
  caPath = path.join(certDir, 'ca.pem');

  // Write only if file doesn't exist or content changed
  const current = fs.existsSync(caPath) ? fs.readFileSync(caPath, 'utf8') : null;
  if (current !== MYSQL_CA) fs.writeFileSync(caPath, MYSQL_CA, { mode: 0o600 });
}




export const sequelize = new Sequelize(
  DB_NAME,
  DB_USER,
  DB_PASS,
  {
    host: DB_HOST,
    port: DB_PORT,
    dialect: 'mysql',
    dialectOptions: caPath ? {
      ssl: {
        ca: fs.readFileSync(caPath),
        rejectUnauthorized: true
      }
    } : {},
    logging: false,
  }
);
