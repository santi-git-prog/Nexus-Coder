import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000/api" : "");

if (!apiBaseUrl) {
  throw new Error("VITE_API_URL must be set to the backend API URL in production.");
}

const api = axios.create({
  baseURL: apiBaseUrl,
});

// Request interceptor to add token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/"; // Redirect to login
    }
    return Promise.reject(error);
  }
);

export default api;
