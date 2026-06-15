/**
 * Service Worker for Web Push Notifications
 *
 * This file runs in the BACKGROUND in the browser, completely separate
 * from your React app. It has no access to React state, components, or the DOM.
 * Its only job here is: receive push → show notification → handle click.
 *
 * Why in public/ ?
 * Vite serves files in public/ at the ROOT of your domain.
 * The service worker MUST be at the root (or a parent scope) of the pages
 * it controls. If it were at /assets/sw.js it could only control /assets/*
 * which is useless. At /sw.js it controls everything.
 */

// 'push' fires when your server sends a notification via web-push library.
// This works even when the browser is completely closed.

self.addEventListener('push', (event) => {
    // Guard: if no data came through, show a generic notification
    if(!event.data){
        self.registration.showNotification("New Notification", {
            body: "You have a new update.",
            icon: "/favicon.png",
        });
        return;
    }

    // Parse the JSON payload your server sent
    let payload;
    try{
        payload = event.data.json();
    }catch{
        payload = { title: "Notification", body: event.data.text() };
    }

    const { 
        title, 
        body, 
        icon = "/favicon.png", 
        badge = "/favicon.png", 
        vibrate = [1000, 200, 1000, 200, 2000],   // 3 strong pulses
        requireInteraction = true,              // stays visible until worker taps it
        data = {} 
    } = payload;

    // event.waitUntil tells the browser: don't kill the service worker
    // until this promise resolves. Without it, the browser might kill the SW
    // before showNotification finishes, and the notification never appears.

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon, 
            badge, 
            data,       // stored on the notification, accessible in notificationclick
            vibrate,  
            requireInteraction,     // notification will NOT auto-dismiss — worker must tap it
            silent: false,          // allow system notification sound to play
            tag: data.tag || "jobfms-general",  // same tag = replace + re-alert
            renotify: true,         // re-vibrate/re-sound on replacement
            actions: [
                { action: "open", title: "View Job" },
            ],
        })
    );
});



// 'notificationclick' fires when the user taps the notification.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();     // dismiss the notification

    const targetUrl = event.notification.data?.url || "/"; 

    // Build the full URL — service worker runs on the frontend domain
    const fullUrl = new URL(targetUrl, self.location.origin).href;

    event.waitUntil(
        // Check if any window with our app is already open
        clients.matchAll({
            type: "window",
            includeUncontrolled: true, 
        }).then( (windowClients) => {
            // Find any open window that belongs to our app
            const existingWindow = windowClients.find( (client) => client.url.startsWith(self.location.origin));

            if(existingWindow){
                // App is already open — just focus it and navigate to the right page
                return existingWindow.focus().then((client) => client.navigate(fullUrl));
            }

            // App is not open — open a new window
            return clients.openWindow(fullUrl);
        })
    );
});


// 'pushsubscriptionchange' fires when the browser automatically rotates
// the subscription (happens periodically). We need to re-subscribe and
// send the new subscription to our server.
// This keeps notifications working long-term without user action.
self.addEventListener("pushsubscriptionchange", (event) => {
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
        }).then(async (newSubscription) => {
            // Send the new subscription to the backend
            // We use fetch here because this is the service worker, not React
            const token = await getTokenFromIndexedDB();
            if(!token) {
                return;
            }

            return fetch(`${self.__API_BASE_URL__ || "https://api.easternpanoramaoffset.com"}/api/notifications/subscribe`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(newSubscription.toJSON()),
            });
        }).catch((err) => {
            console.error("[sw] pushsubscriptionchange failed:", err);
        })
    );
});


// Helper: the service worker cannot access localStorage (React's token storage).
// We store the token in IndexedDB so the SW can retrieve it for re-subscription.
async function getTokenFromIndexedDB(){
    return new Promise((resolve) => {
        const request = indexedDB.open("auth-store", 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore("tokens");
        };

        request.onsuccess = (e) => {
            const db = e.target.result;
            try{
                const tx = db.transaction("tokens", "readonly");
                const store = tx.objectStore("tokens");
                const getRequest = store.get("jwt");
                getRequest.onsuccess = () => resolve(getRequest.result || null);
                getRequest.onerror = () => resolve(null);
            }
            catch{
                resolve(null);
            }
        };

        request.onerror = () => resolve(null);
    });
}