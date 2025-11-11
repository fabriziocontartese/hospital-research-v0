import axios from 'axios';

// Use localhost to match server CORS defaults.
// If REACT_APP_API_BASE is set, it still wins.
const explicit = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
const inferredDev =
  (!explicit &&
    typeof window !== 'undefined' &&
    window.location.port === '3000')
    ? 'http://localhost:4000'
    : null;

const baseURL = explicit || inferredDev || '/api';

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

function readSession() {
  try {
    const raw = localStorage.getItem('hospital-research-session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

apiClient.interceptors.request.use((config) => {
  const token = readSession()?.accessToken || null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single automatic refresh on 401
let refreshing = null;
apiClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config || {};
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;

      const session = readSession();
      const rt = session?.refreshToken;
      if (!rt) throw err;

      if (!refreshing) {
        refreshing = apiClient
          .post('/api/auth/refresh', { refreshToken: rt })
          .then(({ data }) => {
            const next = { ...(session || {}), ...data };
            localStorage.setItem('hospital-research-session', JSON.stringify(next));
            return data.accessToken;
          })
          .finally(() => {
            refreshing = null;
          });
      }

      const newAccess = await refreshing;
      original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newAccess}` };
      return apiClient(original);
    }
    throw err;
  }
);
