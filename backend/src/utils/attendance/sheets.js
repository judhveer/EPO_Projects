// utils/sheets.js
import { google } from 'googleapis';
import fs from 'fs';

const credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_CREDENTIALS, 'utf8'));
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const sheetId = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: SCOPES,
});

export async function getSheetData() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  // Update the range according to your sheet tab and columns
  const range = 'Form Responses 1!A:E'; // A: Timestamp, B: Name, C: Action, D: Location, E: Photo
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  // console.log('Google Sheet data: ', res.data.values);
  return res.data.values;
}


