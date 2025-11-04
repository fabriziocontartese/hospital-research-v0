import axios from 'axios';

/**
 * CRA build uses process.env.REACT_APP_* variables.
 * Set REACT_APP_API_BASE in Netlify to your Render API base URL.
 * Fallback '/api' only for local dev with a proxy.
 */
const baseURL = (process.env.REACT_APP_API_BASE || '/api').trim();

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});
