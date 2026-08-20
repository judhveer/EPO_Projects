import { Router } from "express";
import multer from "multer";
import { getAssignmentByToken, confirmDeliveryByToken } from "../../controllers/jobFmsController/deliveryPublic.controller.js";
import { deliveryConfirmLimiter } from "../../middlewares/rateLimiter.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only PDF, JPG, PNG allowed."));
  },
});

const safeUpload = (mw) => (req, res, next) =>
  mw(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          message: "File too large. Maximum size is 15 MB. Please compress the photo and try again.",
        });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ message: "Too many files uploaded." });
      }
      return res.status(400).json({ message: err.message });
    }
    next();
  });

// No authenticate middleware — these are public
router.get("/:token", getAssignmentByToken);

// deliveryConfirmLimiter runs before multer — no point parsing a multipart
// upload if the request is going to be rejected by rate limiting anyway.
// This also protects your Google Drive quota from spam.
router.post("/:token/confirm", 
  // Accept both files in one multipart request
  deliveryConfirmLimiter,
  safeUpload(
    upload.fields([
      { name: "challan_file", maxCount: 1 },
      { name: "material_photo", maxCount: 1 }, // optional
    ])
  ), 
  confirmDeliveryByToken
);

export default router;
