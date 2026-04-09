import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { google } from "googleapis";
import { getAccessToken } from "./oauthClient.js";

dotenv.config();

export async function createTransporter() {
  console.log("Creating email transporter with OAuth2...");

  try {
    const accessToken = await getAccessToken();

    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465, // Changed from 465 to 587 (STARTTLS is more reliable)
      secure: true, // false for port 587, true for 465
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
        accessToken: accessToken,
      },
      // Better connection pooling settings
      pool: false,
      family: 4,
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
