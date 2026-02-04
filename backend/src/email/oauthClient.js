import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

let cachedAccessToken = null;
let tokenExpiry = null;

export async function getAccessToken() {
  // Return cached token if it's still valid (with 5-minute buffer)
  if (cachedAccessToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken;
  }

  try{
    const { token } = await oauth2Client.getAccessToken();
    
    if (!token) {
      throw new Error("No access token returned");
    }
    // Cache the token
    cachedAccessToken = token;
    // Tokens typically expire in 1 hour (3600 seconds)
    tokenExpiry = Date.now() + 3600 * 1000;
    console.log("✅ New access token generated");
    return token;
  } catch (error) {
    console.error("❌ Error getting access token:", error.message);
    throw error;
  }
}
