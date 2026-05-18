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


import { google } from 'googleapis';
import { Readable } from 'stream';

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

// Lazy-built auth client — singleton across the process.
let _driveClient = null;

function buildAuth() {
    const keyPath = process.env.GDRIVE_SERVICE_ACCOUNT_KEY_PATH;

    if(keyPath){
        return new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: SCOPES,
        });
    }

    throw new Error(
        "Google Drive credentials not configured. Set GDRIVE_SERVICE_ACCOUNT_JSON or GDRIVE_SERVICE_ACCOUNT_KEY_PATH."
    );
}

function getDriveClient() {
    if(!_driveClient){
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
 * Uploads a buffer to the configured Drive folder.
 * Returns { file_id, web_view_link }.
 *
 * The file is made readable by anyone with the link (typical for challans
 * that customers/auditors may need to view). If your org Drive policy
 * forbids "anyone with link" sharing, the permission step will fail
 * silently and the file will only be visible to people the folder is
 * shared with — also acceptable.
 */

export async function uploadChallanToDrive({ buffer, filename, mimeType, job_no }){
    const folderId = process.env.GDRIVE_CHALLAN_FOLDER_ID;
    if(!folderId){
        throw new Error("GDRIVE_CHALLAN_FOLDER_ID not configured");
    }

    if (!buffer || !buffer.length) {
        throw new Error("Challan file buffer is empty.");
    }

    const drive = getDriveClient();

    const safeName = `challan_${job_no}_${Date.now()}_${sanitizeFilename(filename)}`;

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

    // Best-effort: make link-shareable. Non-fatal if org policy blocks it.
    try{
        await drive.permissions.create({
            fileId: data.id,
            requestBody: {
                role: "reader",
                type: "anyone",
            },
        });
    }
    catch(permErr){
        console.warn(
        `[gdrive] Could not set anyone-with-link permission on ${data.id}: ${permErr.message}`
        );
    }

    return {
        file_id: data.id,
        web_view_link: data.webViewLink,
    };
}