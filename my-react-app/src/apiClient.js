import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

export const apiClient = axios.create({ baseURL });

// The access token lives only in this module's memory, never in localStorage.
// That's deliberate: it disappears on tab close/refresh, and an XSS payload
// that reads localStorage only gets a (revocable) refresh token, not a live
// bearer token it could replay immediately.
let accessToken = null;
let onAuthChange = null; // wired up by AuthContext so it can react to silent refresh/logout

export function setAccessToken(token) {
  accessToken = token;
}

export function setAuthChangeHandler(handler) {
  onAuthChange = handler;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Several requests can fail with 401 at the same moment (e.g. a page that
// fires 3 calls on mount, all using an access token that just expired).
// Without sharing one in-flight refresh, you'd fire 3 refresh calls and the
// first one to land would rotate the refresh token out from under the other 2.
let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (!response || response.status !== 401 || config._retried) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
      return Promise.reject(error);
    }

    config._retried = true;

    try {
      if (!refreshPromise) {
        refreshPromise = axios
          .post(`${baseURL}/auth/refresh`, { refreshToken })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const { data } = await refreshPromise;
      accessToken = data.accessToken;
      localStorage.setItem("refreshToken", data.refreshToken);
      onAuthChange?.({ role: data.role });

      config.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(config);
    } catch (refreshError) {
      accessToken = null;
      localStorage.removeItem("refreshToken");
      onAuthChange?.(null);
      return Promise.reject(refreshError);
    }
  }
);
