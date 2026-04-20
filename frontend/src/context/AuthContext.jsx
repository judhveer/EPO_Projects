import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { setAuthToken, registerPauseOnLogout } from '../lib/api';
import api from '../lib/api';

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
    console.log("blob: ", blob);
    navigator.sendBeacon(url, blob);
    return;
  }

  // Fallback: regular fetch (works when tab stays open after logout)
  // keepalive: true makes it survive page unload in browsers without sendBeacon
  fetch(url, {
    method: "GET",
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
      // Register so the 401 interceptor can call firePauseOnLogout
      // when JWT expires mid-session without an explicit logout click.
      registerPauseOnLogout(firePauseOnLogout);
    }, []); // runs once on mount — firePauseOnLogout is module-level, stable


    const login = async (identifier, password) => {
        console.log("login called");
        const { data } = await api.post('/api/auth/login', { identifier, password });
        console.log("data: ", data);
        setAuthToken(data.token);
        setUser(data.user);
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
        firePauseOnLogout(token);
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