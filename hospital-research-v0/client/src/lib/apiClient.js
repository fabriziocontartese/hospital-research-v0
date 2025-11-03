import axios from 'axios';
import { getSession, saveSession, clearSession } from './auth';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

let refreshRequest = null;

apiClient.interceptors.request.use((config) => {
  const session = getSession();
  if (session?.accessToken) {
    /* eslint-disable no-param-reassign */
    config.headers.Authorization = `Bearer ${session.accessToken}`;
    /* eslint-enable no-param-reassign */
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      const session = getSession();
      if (!session?.refreshToken) {
        clearSession();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (!refreshRequest) {
        refreshRequest = axios
          .post(`${API_BASE_URL}/api/auth/refresh`, { refreshToken: session.refreshToken })
          .then((res) => {
            const payload = {
              ...session,
              accessToken: res.data.accessToken,
              refreshToken: res.data.refreshToken,
            };
            saveSession(payload);
            return res.data;
          })
          .catch((refreshError) => {
            clearSession();
            throw refreshError;
          })
          .finally(() => {
            refreshRequest = null;
          });
      }

      try {
        originalRequest._retry = true;
        const refreshed = await refreshRequest;
        originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export { apiClient };
