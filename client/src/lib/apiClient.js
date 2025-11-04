import axios from 'axios';

// Vite-style env var for API base URL
// Netlify: set VITE_API_BASE_URL in Environment variables
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});
