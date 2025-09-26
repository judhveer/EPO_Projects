// src/utils/sheets.js
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const sheetId = process.env.GOOGLE_SHEET_ID;

// 1) If JSON creds are provided in an env var, write them to a runtime file
const credsEnv = process.env.GOOGLE_CREDENTIALS || process.env.CREDENTIALS_JSON;
const runtimeCredPath = path.join(process.cwd(), 'credentials.json');

if (credsEnv) {
  try {
    // Normalize string (in case newlines were escaped)
    const credsText = typeof credsEnv === 'string' ? credsEnv : JSON.stringify(credsEnv);
    const current = fs.existsSync(runtimeCredPath) ? fs.readFileSync(runtimeCredPath, 'utf8') : null;
    if (current !== credsText) {
      fs.writeFileSync(runtimeCredPath, credsText, { mode: 0o600 });
      console.log('Wrote credentials.json from env to', runtimeCredPath);
    } else {
      console.log('credentials.json already up-to-date at', runtimeCredPath);
    }
    // Let Google libraries pick it up if they read GOOGLE_APPLICATION_CREDENTIALS
    process.env.GOOGLE_APPLICATION_CREDENTIALS = runtimeCredPath;
  } catch (err) {
    console.error('Failed to write credentials.json from env:', err);
    throw err;
  }
}

// 2) Prepare auth options — prefer passing credentials object if available
let googleAuth;
(async () => {
  try {
    // If credsEnv exists, parse it so we can pass credentials object directly
    if (credsEnv) {
      let credsObj;
      try {
        credsObj = typeof credsEnv === 'string' ? JSON.parse(credsEnv) : credsEnv;
      } catch (err) {
        console.warn('GOOGLE_CREDENTIALS exists but is not valid JSON — falling back to key file. Error:', err.message);
        credsObj = null;
      }

      if (credsObj) {
        googleAuth = new google.auth.GoogleAuth({
          credentials: credsObj,
          scopes: SCOPES,
        });
        console.log('GoogleAuth configured from GOOGLE_CREDENTIALS env var (in-memory).');
        return;
      }
      // if parse failed, will fallthrough to try keyFile below
    }

    // If GOOGLE_APPLICATION_CREDENTIALS is set and file exists, use keyFile
    const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || runtimeCredPath;
    if (keyFilePath && fs.existsSync(keyFilePath)) {
      googleAuth = new google.auth.GoogleAuth({
        keyFile: keyFilePath,
        scopes: SCOPES,
      });
      console.log('GoogleAuth configured with keyFile:', keyFilePath);
      return;
    }

    // Last resort: try ADC (Application Default Credentials)
    googleAuth = new google.auth.GoogleAuth({ scopes: SCOPES });
    console.log('GoogleAuth configured using default credentials (ADC).');
  } catch (err) {
    console.error('Error creating GoogleAuth:', err);
    throw err;
  }
})();

// Helper: ensure auth is ready (since we initialize above in an IIFE)
async function getAuthClient() {
  // if googleAuth was created synchronously above, return its client; otherwise wait briefly
  // (the IIFE sets googleAuth right away in normal cases)
  if (!googleAuth) {
    // wait up to a short time for googleAuth to be set (unlikely, but defensive)
    const start = Date.now();
    while (!googleAuth && Date.now() - start < 3000) {
      // small delay
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 50));
    }
    if (!googleAuth) throw new Error('GoogleAuth not initialized');
  }
  return googleAuth.getClient();
}

// Public function to fetch sheet data
export async function getSheetData(range = 'Form Responses 1!A:E') {
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID env var is not set');
  }
  try {
    const client = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });
    return res.data.values || [];
  } catch (err) {
    console.error('Error fetching Google Sheet data:', err.message || err);
    throw err;
  }
}
