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
