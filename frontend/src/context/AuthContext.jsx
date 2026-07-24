import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { setAuthToken, registerPauseOnLogout } from '../lib/api';
import api from '../lib/api';

import {
  registerPushNotifications,
  unregisterPushNotifications,
} from "../utils/pushNotifications.js";

const AuthContext = createContext(null);


// WHY sendBeacon here too:
//   Some users click logout then immediately close the tab. sendBeacon
//   guarantees the request leaves the device even during unload.
// ─────────────────────────────────────────────────────────────────────────────
const firePauseOnLogout = (token) => {
  if (!token) return;

  const url = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/fms/designers/pause-on-logout`;
  // sendBeacon: works during page unload, no headers possible
  // We include the token in the body so the backend can authenticate
  // via a manual jwt.verify (same pattern as pause-beacon endpoint)
  if (navigator.sendBeacon) {
    const blob = new Blob(
      [JSON.stringify({ token })],
      { type: "application/json" },
    );
    navigator.sendBeacon(url, blob);
    return;
  }

  // Fallback: regular fetch (works when tab stays open after logout)
  // keepalive: true makes it survive page unload in browsers without sendBeacon
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
    keepalive: true, // survive page navigation/unload
  }).catch(() => {
    console.log("Failed to fire pause-on-logout via fetch — likely due to page unload");
    // Silent — pause-on-logout is best-effort
  });
};

// Mirror of firePauseOnLogout for Production Workers.
// Pauses any in_progress worker assignments on logout or JWT expiry.
// sendBeacon cannot send headers — token goes in the body, verified manually server-side.
const fireWorkerPauseOnLogout = (token) => {
  console.log("fireWorkerPauseOnLogout called");
  if (!token) return;

  const url = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/fms/worker/pause-on-logout`;

  if (navigator.sendBeacon) {
    const blob = new Blob(
      [JSON.stringify({ token })],
      { type: "application/json" }
    );
    navigator.sendBeacon(url, blob);
    return;
  }

  // Fallback for browsers without sendBeacon
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    keepalive: true,
  }).catch(() => {});
};


export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function boot() {
            try {
                if (!localStorage.getItem('token')) {
                    setUser(null);
                    return;
                }
                setAuthToken(localStorage.getItem('token'));
                const { data } = await api.get('/api/auth/me');
                setUser(data.user);
                // Re-register push subscription on page refresh
                // (the token is already in localStorage)
                registerPushNotifications(localStorage.getItem('token')).catch(() => {});
            }
            catch(error) {
                setUser(null);
             }
            finally {
                setLoading(false);
            }
        }
        boot();
    }, []);

    // Inside AuthProvider, add this useEffect after your existing ones:
    useEffect(() => {
      // Register both beacons for the 401 interceptor (JWT expiry mid-session).
      // Each endpoint is a no-op if the user has no active work there —
      // firing both for all roles is safe and avoids a department check
      // in a closure that may not have a fresh user reference.
      registerPauseOnLogout((token) => {
        firePauseOnLogout(token);
        fireWorkerPauseOnLogout(token);
      });
    }, []); // runs once on mount — firePauseOnLogout is module-level, stable


    const login = async (identifier, password) => {
        const { data } = await api.post('/api/auth/login', { identifier, password });
        setAuthToken(data.token);
        setUser(data.user);

        // Register for push notifications after login
        // Fire-and-forget — don't block login if this fails
        registerPushNotifications(data.token).catch(() => {});

        return data.user;
    };

    const logout = useCallback(() => {
        // ── Fire pause BEFORE clearing the token ─────────────────────────────
        // The token is still valid at this point — backend can authenticate the
        // pause-on-logout request. If we cleared it first, the request would 401.
        //
        // Only meaningful for designers — other roles have no active timer.
        // The backend endpoint is a no-op for non-designers.
        const token = localStorage.getItem('token');

        // Unsubscribe from push before clearing token
        unregisterPushNotifications(token).catch(() => {});

        firePauseOnLogout(token);
        fireWorkerPauseOnLogout(token);
        setAuthToken(null);
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user, loading, login, logout,
    }), [user, loading, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    return useContext(AuthContext);
}   