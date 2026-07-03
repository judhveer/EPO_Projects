import { Router } from "express";
import { requireBossOrAdmin } from "../../middlewares/authorize.js";
import adminUsersRoutes from "./adminUsers.routes.js";
import adminPapersRoutes from "./adminPapers.routes.js";

const router = Router();

// Every route under /api/admin requires BOSS or ADMIN role.
// `authenticate` is applied once at the app.js mount level.

router.use(requireBossOrAdmin);

router.use("/users", adminUsersRoutes);
router.use("/papers", adminPapersRoutes);
// Next: router.use("/wide-format", adminWideFormatRoutes);
// Next: router.use("/insights", adminInsightsRoutes);


export default router;
