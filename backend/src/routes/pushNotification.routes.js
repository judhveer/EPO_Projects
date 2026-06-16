import { Router } from "express";

import authenticate from "../middlewares/authenticate.js";

import { 
    getVapidPublicKey,
    saveSubscription,
    removeSubscription,
} from "../controllers/pushNotification.controller.js";

const router = Router();

// Public — no auth needed. Browser needs this key BEFORE subscribing.
router.get("/vapid-public-key", getVapidPublicKey);


// Protected — must know which user to link the subscription to
router.post("/subscribe", authenticate, saveSubscription);
router.delete("/unsubscribe", authenticate, removeSubscription);

export default router;