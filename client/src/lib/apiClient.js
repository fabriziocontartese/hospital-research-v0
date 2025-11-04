import axios from 'axios';

/**
 * CRA uses process.env.REACT_APP_* at build time.
 * Netlify: set REACT_APP_API_BASE to your Render API base URL.
 */
const baseURL = (process.env.REACT_APP_API_BASE || '/api').trim();

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

// Add an interceptor to include the authentication token in all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken'); // Retrieve the token from localStorage
    if (!token) {
      console.error('No auth token found in localStorage'); // Debugging log
    } else {
      config.headers.Authorization = `Bearer ${token}`; // Add the token to the Authorization header
    }
    return config;
  },
  (error) => Promise.reject(error)
);
