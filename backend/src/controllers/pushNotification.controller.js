import db from "../models";
/**
 * GET /api/notifications/vapid-public-key
 *
 * Frontend needs the VAPID public key to create a push subscription.
 * This is public information — safe to expose.
 * The browser uses it to verify that pushes actually come from your server.
 */

export const getVapidPublicKey = (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;

    if(!key){
        return res.status(500).json({
            message: "Push Notification not configured. VAPID public key is missing.",
        });
    }

    return res.json({
        publicKey: key
    });
}


/**
 * POST /api/notifications/subscribe
 * Body: { endpoint, keys: { p256dh, auth } }
 *
 * Called by the frontend after the browser creates a push subscription.
 * We store it in the DB linked to req.user.id.
 *
 * Why upsert instead of insert?
 * If the user refreshes or logs in again, the browser may return the same
 * subscription. We use the endpoint as the unique identifier.
 * If it already exists for this user — do nothing. If it's new — create it.
 */

export const saveSubscription = async (req, res) => {
    try{
        const { endpoint, keys } = req.body;

        if(!endpoint || !keys?.p256dh || !keys?.auth){
            return res.status(400).json({
                message: "Invalid subscription object. Must include endpoint and keys (p256dh, auth).",
            });
        }

        // Check if this exact subscription already exists for this user
        const existing = await db.PushSubscription.findOne({
            where: {
                user_id: req.user.id,
                endpoint,
            }
        });

        if(!existing){
            await db.PushSubscription.create({
                user_id: req.user.id,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
            });
        }

        return res.json({
            message: "Subscription saved successfully.",
        });
    }
    catch(err){
        console.error("[push-subscribe]", err);
        return res.status(500).json({
            message: "Failed to save subscription. Please try again later.",
        });
    }
};


/**
 * DELETE /api/notifications/unsubscribe
 * Body: { endpoint }
 *
 * Called when the user logs out or manually revokes permission.
 * Removes only the subscription for the current browser/device.
 * Other subscriptions (other devices) are unaffected.
 */

export const removeSubscription = async (req, res) => {
    try{
        const { endpoint } = req.body;

        if(!endpoint){
            return res.status(400).json({
                message: "Endpoint is required to unsubscribe.",
            });
        }

        await db.PushSubscription.destroy({
            where: {
                user_id: req.user.id,
                endpoint,
            }
        });

        return res.json({
            message: "Subscription removed successfully.",
        });
    }
    catch(err){
        console.error("[push-unsubscribe]", err);
        return res.status(500).json({
            message: "Failed to remove subscripton. Please try again later.",
        });
    }
};

