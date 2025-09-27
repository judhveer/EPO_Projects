import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://epo-projects.onrender.com/',
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


api.interceptors.response.use(
  r => r,
  (err) => {
    const status = err?.response?.status;
    const url = err?.config.url || '';

    const isAuthLogin = url.includes('/api/auth/login');
    if (status === 401 && !isAuthLogin) {
      setAuthToken(null);
      if(window.location.pathname !== '/login'){
        window.location.replace('/login');
      }
    }
    return Promise.reject(err);
  }
);

