import axios from 'axios';

const explicit = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
const inferredDev =
  (!explicit &&
    typeof window !== 'undefined' &&
    (window.location.port === '3000' || window.location.port === '5173'))
    ? 'http://127.0.0.1:4000'
    : null;

const baseURL = explicit || inferredDev || '/api';

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

/* session helpers */
const KEY = 'hospital-research-session';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = (s) => { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); };

/* attach Authorization */
apiClient.interceptors.request.use((config) => {
  const token = read()?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* 401 handler with guards + single-flight */
let refreshPromise = null;

const isAuthEndpoint = (url) => {
  try {
    // handle relative and absolute URLs
    const u = url.startsWith('http') ? new URL(url) : new URL(url, baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
    return u.pathname.endsWith('/api/auth/refresh')
        || u.pathname.endsWith('/api/auth/login')
        || u.pathname.endsWith('/api/auth/logout');
  } catch {
    return url.includes('/api/auth/refresh') || url.includes('/api/auth/login') || url.includes('/api/auth/logout');
  }
};

apiClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    const res = err.response;
    const original = err.config || {};
    const url = original.url || '';

    if (!res || res.status !== 401 || original._retry || isAuthEndpoint(url)) {
      throw err;
    }

    original._retry = true;

    const session = read();
    const rt = session?.refreshToken;
    if (!rt) throw err;

    if (!refreshPromise) {
      refreshPromise = apiClient.post('/api/auth/refresh', { refreshToken: rt })
        .then(({ data }) => {
          write({ ...(session || {}), ...data });
          return data.accessToken;
        })
        .catch((e) => { write(null); throw e; })
        .finally(() => { refreshPromise = null; });
    }

    const newAccess = await refreshPromise;
    original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newAccess}` };
    return apiClient(original);
  }
);
