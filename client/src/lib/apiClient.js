import axios from 'axios';

const baseURL = process.env.REACT_APP_API_BASE || '/api';

export const apiClient = axios.create({
  baseURL,
  withCredentials: , // keep if your server uses cookies; otherwise false
});