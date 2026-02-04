import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { google } from "googleapis";
import { getAccessToken } from "./oauthClient.js";

dotenv.config();

export async function createTransporter() {
  console.log("Creating email transporter with OAuth2...");

  try {
    const accessToken = await getAccessToken();

    // Create OAuth2 client for token refresh
    // const OAuth2 = google.auth.OAuth2;
    // const oauth2Client = new OAuth2(
    //   process.env.CLIENT_ID,
    //   process.env.CLIENT_SECRET,
    //   "https://developers.google.com/oauthplayground"
    // );

    // oauth2Client.setCredentials({
    //   refresh_token: process.env.REFRESH_TOKEN,
    // });

    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587, // Changed from 465 to 587 (STARTTLS is more reliable)
      secure: false, // false for port 587, true for 465
      requireTLS: true, // Require TLS
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
        accessToken: accessToken,
        expires: 3600, // Token expiration
      },
      // Better connection pooling settings
      pool: true,
      maxConnections: 3, // Increased slightly
      maxMessages: 10,
      socketTimeout: 30000, // 30 seconds
      connectionTimeout: 10000, // 10 seconds
      // TLS options to prevent SSL errors
      tls: {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      },
      // Handle token refresh automatically
      authMethod: "XOAUTH2",
    });
  } catch (error) {
    console.error("Error creating transporter:", error);
    throw error;
  }
}
