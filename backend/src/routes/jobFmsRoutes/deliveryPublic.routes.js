import { Router } from "express";
import multer from "multer";
import { getAssignmentByToken, confirmDeliveryByToken } from "../../controllers/jobFmsController/deliveryPublic.controller.js";

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
      return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: err.message });
    }
    next();
  });

// No authenticate middleware — these are public
router.get("/:token", getAssignmentByToken);


router.post("/:token/confirm", 
  // Accept both files in one multipart request
  safeUpload(
    upload.fields([
      { name: "challan_file", maxCount: 1 },
      { name: "material_photo", maxCount: 1 }, // optional
    ])
  ), 
  confirmDeliveryByToken
);

export default router;
