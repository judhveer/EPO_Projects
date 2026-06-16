/**
 * Web Push Notification utility for the frontend.
 *
 * Concept of urlBase64ToUint8Array:
 * The VAPID public key comes from your server as a Base64 string.
 * The browser's PushManager.subscribe() needs it as a Uint8Array
 * (raw bytes). This function converts between the two formats.
 * You do not need to understand the cryptography — just know that
 * this conversion is required by the Web Push specification.
 */

function urlBase64ToUint8Array(base64String){
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}


/**
 * Stores the JWT token in IndexedDB so the Service Worker can access it
 * for the pushsubscriptionchange event (SW has no access to localStorage).
 */

async function storeTokenInIndexedDB(token) {
    return new Promise((resolve) => {
        const request = indexedDB.open("auth-store", 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore("tokens");
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            try{
                const tx = db.transaction("tokens", "readwrite");
                tx.objectStore("tokens").put(token, "jwt");
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            }
            catch {
                resolve();
            }
        };
        request.onerror = resolve;
    });
}

/**
 * Removes the JWT token from IndexedDB on logout.
 */

async function removeTokenFromIndexedDB(){
    return new Promise((resolve) => {
        const request = indexedDB.open("auth-store", 1);
        request.onsuccess = (e) => {
            const db = e.target.result;
            try{
                const tx = db.transaction("tokens", "readwrite");
                tx.objectStore("tokens").delete("jwt");
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            }catch{
                resolve();
            }
        };
        request.onerror = resolve;
    });
}


const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://api.easternpanoramaoffset.com"; 

/**
 * Registers the service worker and subscribes to push notifications.
 * Call this after the user logs in.
 *
 * Flow:
 * 1. Check browser support
 * 2. Register /sw.js as a service worker
 * 3. Fetch VAPID public key from backend
 * 4. Ask browser for push permission
 * 5. Create push subscription (browser → push service)
 * 6. Send subscription to backend (backend stores it in DB)
 */

export async function registerPushNotifications(token) {
    // Store token for service worker's pushsubscriptionchange handler
    if(token){
        await storeTokenInIndexedDB(token);
    }

    // Check browser support
    if(!("serviceWorker" in navigator)){
        console.log("[push] Service Workers not supported in this browser.");
        return;
    }

    if(!("PushManager" in window)){
        console.log("[push] Push API not supported in this browser.");
        return;
    }

    try{
        // Register the service worker
        // The SW file is at /sw.js (served from frontend/public/sw.js by Vite)
        const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
        });
        console.log("[push] Service worker registered:", registration.scope);

        // Wait for the service worker to be ready
        await navigator.serviceWorker.ready;

        // Check if already subscribed — no need to re-subscribe every login
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
            console.log("[push] Already subscribed. Refreshing with backend.");
            await sendSubscriptionToBackend(existingSubscription, token);
            return;
        }

        // Fetch the VAPID public key from your backend
        const keyResponse = await fetch(`${API_BASE}/api/notifications/vapid-public-key`);
        const { publicKey } = await keyResponse.json();

        // Request push permission and create subscription
        // userVisibleOnly: true = browser requires that every push shows a notification
        // (you cannot silently push data without showing something to the user)
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        console.log("[push] New subscription created.");

        // Send subscription to backend to store it
        await sendSubscriptionToBackend(subscription, token);
    }
    catch(err){
        if(Notification.permission === "denied"){
            console.log("[push] User denied notification permission.");
        }
        else{
            console.error("[push] Subscription failed :::", err);
        }
    }
}


async function sendSubscriptionToBackend(subscription, token){
    try{
        const subJson = subscription.toJSON();
        await fetch(`${API_BASE}/api/notifications/subscribe`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                endpoint: subJson.endpoint,
                keys: {
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth,
                },
            }),
        });
        console.log("[push] Subscription synced to backend.");
    }
    catch(err){
        console.error("[push] Failed to sync subscription to backend:", err);
    }
}


/**
 * Unsubscribes from push notifications.
 * Call this when the user logs out.
 */
export async function unregisterPushNotifications(token){
    await removeTokenFromIndexedDB();

    if (!("serviceWorker" in navigator)) return;

    try{
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if(!subscription) return;

        // Tell backend to remove this subscription
        await fetch(`${API_BASE}/api/notifications/unsubscribe`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        // Unsubscribe in the browser
        await subscription.unsubscribe();
        console.log("[push] Unsubscribed from push notifications.");
    }
    catch (err){
        console.error("[push] Unsubscribe failed:", err);
    }
}   

