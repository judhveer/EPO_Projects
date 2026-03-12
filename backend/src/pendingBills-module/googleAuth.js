// utils/sheets.js
import { google } from 'googleapis';
import fs from 'fs';

const credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_CREDENTIALS, 'utf8'));
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const sheetId = process.env.BILLING_SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: SCOPES,
});



export async function getBillingSheetData() {
  try {
    const client = await auth.getClient();

    const sheets = google.sheets({
      version: 'v4',
      auth: client,
    });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Form Responses 1!A:Q',
    });

    return res.data.values || [];

  } catch (error) {
    console.error("Google Sheets Error:", error);
    throw error;
  }
}