import webpush from "web-push";
import db from '../models/index.js';

// Configure web-push once with your VAPID keys.
// This must happen before any sendNotification calls.
webpush.setVapidDetails(
    process.env.VAPID_MAILTO,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);


/**
 * Sends a push notification to ALL subscriptions for a given user.
 *
 * Why multiple subscriptions per user?
 * A user might have Chrome open on their laptop AND Chrome on their phone.
 * Each browser+device registers its own subscription. We send to all of them
 * so the notification reaches them on whichever device they pick up first.
 *
 * @param {string} userId - The user's UUID
 * @param {object} payload - { title, body, icon, data: { url } }
 */

export async function sendPushToUser(userId, payload) {
    const subscriptions = await db.PushSubscription.findAll({
        where: { userId },
    });

    if(subscriptions.length === 0) {
        console.log(`No push subscriptions found for user ${userId}`);
        return;
    }

    const payloadString = JSON.stringify(payload);

    const results = await Promise.allSettled(
        subscriptions.map( async (sub) => {
            try{
                await webpush.sendNotification({
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.p256dh,
                            auth: sub.auth,
                        },
                    },
                    payloadString,
                );
            } catch (err){
                // 410 Gone or 404 = subscription is expired/deleted by the browser.
                // The browser creates new subscriptions over time.
                // Remove stale ones immediately to keep the table clean.
                if(err.statusCode === 410 || err.statusCode === 404){
                    console.log(`[push] Removing stale subscription for user ${userId}`);
                    await sub.destroy();
                }
                else{
                    console.error(`[push] Failed to send to user ${userId}:`, err.message);
                }
            }
        })
    );

    return results;
}

/**
 * Sends a push notification to ALL active users in a given department.
 * Used to notify all Production Coordinators when a stage is complete.
 *
 * @param {string} department - e.g. "Production Coordinator"
 * @param {object} payload
 */

