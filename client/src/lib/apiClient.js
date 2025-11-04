import axios from 'axios';

/**
 * Frontend API client:
 * - REACT_APP_API_BASE is injected at build time by CRA.
 * - If not provided, fall back to '/api' for local proxy or same-origin requests.
 *
 * Local dev: create client/.env.development with REACT_APP_API_BASE=http://localhost:5005
 * Netlify: set REACT_APP_API_BASE in Netlify site environment to your API URL.
 */
const baseURL = process.env.REACT_APP_API_BASE || '/api';

export const apiClient = axios.create({
  baseURL,
  // set to true if your API uses cookie-based sessions (server cors uses credentials: true)
  // set to false if you only use token authorization headers
  withCredentials: true,
});