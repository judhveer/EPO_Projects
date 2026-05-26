/**
 * Google Drive upload helper for challan documents.
 *
 * Uses a service account (server-to-server auth — no user OAuth flow).
 * Reads credentials from one of:
 *   - GDRIVE_SERVICE_ACCOUNT_JSON   (inline JSON, preferred in production)
 *   - GDRIVE_SERVICE_ACCOUNT_KEY_PATH (path to JSON key file, useful for dev)
 *
 * Required env vars:
 *   - GDRIVE_CHALLAN_FOLDER_ID — ID of the Drive folder where challans are stored.
 *     The folder MUST be shared with the service account email as Editor.
 *
 * IMPORTANT:
 * Upload happens BEFORE the DB transaction. If the DB transaction later fails,
 * an orphan file will remain on Drive. The filename includes job_no and a
 * timestamp so a cleanup script (future) can identify orphans by cross-checking
 * with jobfms_job_cards.challan_file_url.
 */

import { google } from "googleapis";
import { Readable } from "stream";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

// Lazy-built auth client — singleton across the process.
let _driveClient = null;

function buildAuth() {
  const keyPath = process.env.GDRIVE_SERVICE_ACCOUNT_KEY_PATH;

  if (keyPath) {
    return new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: SCOPES,
    });
  }

  throw new Error(
    "Google Drive credentials not configured. Set GDRIVE_SERVICE_ACCOUNT_JSON or GDRIVE_SERVICE_ACCOUNT_KEY_PATH.",
  );
}

function getDriveClient() {
  if (!_driveClient) {
    _driveClient = google.drive({ version: "v3", auth: buildAuth() });
  }

  return _driveClient;
}

/**
 * Sanitize a filename for Drive — strips path separators and weird characters
 * but preserves the original (visible) name as much as possible.
 */

function sanitizeFilename(name) {
  return (name || "challan")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180); // Drive allows up to 255; leave room for prefix
}

/**
 * Internal — uploads any buffer to the specified Drive folder.
 * Retries permission setting up to 3 times to handle Drive's eventual consistency.
 */

async function uploadFileToDrive({ buffer, filename, mimeType, folderId, filenamePrefix, }) {
  if (!folderId) {
    throw new Error("Drive folder ID not configured.");
  }

  if (!buffer?.length) {
    throw new Error("File Buffer is empty.");
  }

  const drive = getDriveClient();
  const safeName = `${filenamePrefix}_${Date.now()}_${sanitizeFilename(filename)}`;

  const { data } = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || "application/octet-stream",
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  if (!data?.id) {
    throw new Error("Drive upload returned no file ID.");
  }

  // Retry permission setting — Drive has eventual consistency on newly created files
  // Best-effort: make link-shareable. Non-fatal if org policy blocks it.
  // Best-effort: make link-shareable. Non-fatal if org policy blocks it.
  // Retries 3 times with increasing delay because Google Drive has eventual
  // consistency — the file sometimes isn't visible to the permissions endpoint
  // immediately after creation (race condition).
  let permissionSet = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) {
        // 1s delay on 2nd attempt, 2s on 3rd
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
      await drive.permissions.create({
        fileId: data.id,
        requestBody: { role: "reader", type: "anyone" },
        supportsAllDrives: true,
      });
      permissionSet = true;
      break;
    } catch (permErr) {
      if (attempt === 3) {
        console.warn(
          `[gdrive] Permission not set on ${data.id} after 3 attempts: ${permErr.message}`,
        );
      }
    }
  }

  if (!permissionSet) {
    console.warn(
      `[gdrive] File ${data.id} uploaded but public link may not work. ` +
        `Fallback: share the Challans folder in Drive UI as "Anyone with the link".`,
    );
  }

  return {
    file_id: data.id,
    web_view_link: data.webViewLink,
  };
}

/**
 * Uploads a challan document to the challan folder.
 */
export async function uploadChallanToDrive({ buffer, filename, mimeType, job_no, }) {
    return uploadFileToDrive({
        buffer,
        filename,
        mimeType,
        folderId: process.env.GDRIVE_CHALLAN_FOLDER_ID,
        filenamePrefix: `challan_${job_no}`,
    });
}

/**
 * Uploads a material/delivery photo to the material photos folder.
 */
export async function uploadMaterialPhotoToDrive({ buffer, filename, mimeType, job_no, }){
    return uploadFileToDrive({
        buffer,
        filename,
        mimeType,
        folderId: process.env.GDRIVE_MATERIAL_PHOTO_FOLDER_ID,
        filenamePrefix: `material_${job_no}`,
    });
}

