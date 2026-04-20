import axios from 'axios';

const api = axios.create({
  baseURL:  import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});


export default api;

// simple helpers
export const toNull = (v) => (v === '' || v === undefined ? null : v);
export const toNumberOrNull = (v) => (v === '' || v === undefined ? null : Number(v));

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('token', token);
  }
  else {
    delete api.defaults.headers.common['Authorization'];
    localStorage.removeItem('token');
  }
}

const saved = localStorage.getItem('token');
if (saved) {
  setAuthToken(saved);
}



// ── Pause-on-logout registry ──────────────────────────────────────────────────
// AuthContext registers `firePauseOnLogout` here so the 401 interceptor
// can call it without a circular import (api.js → AuthContext → api.js).
// Only one function is ever registered — the one from AuthProvider.
let _firePauseOnLogout = null;


export const registerPauseOnLogout = (fn) => {
  _firePauseOnLogout = fn;
};


api.interceptors.response.use(
  r => r,
  (err) => {
    const status = err?.response?.status;
    const url = err?.config.url || '';

    const isAuthLogin = url.includes('/api/auth/login');
    if (status === 401 && !isAuthLogin) {
      // ── Fire pause BEFORE clearing token ───────────────────────────────
      // Token is still in localStorage at this point — backend can verify it.
      // _firePauseOnLogout is null for non-designer roles → safe no-op.
      if (_firePauseOnLogout) {
        const token = localStorage.getItem('token');
        _firePauseOnLogout(token);
      }
      
      setAuthToken(null);
      if(window.location.pathname !== '/login'){
        window.location.replace('/login');
      }
    }
    return Promise.reject(err);
  }
);

