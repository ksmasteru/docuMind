import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiClient, setAccessToken, setAuthChangeHandler } from "./apiClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Let apiClient push state changes back here when it silently refreshes
  // or gives up and logs the user out from inside a 401 handler.
  useEffect(() => {
    setAuthChangeHandler((data) => setUser(data));
  }, []);

  // On first load there's no access token in memory (page was refreshed or
  // this is a new tab) — try to mint one from the refresh token in
  // localStorage before rendering protected content.
  useEffect(() => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
      setIsLoading(false);
      return;
    }

    apiClient
      .post("/auth/refresh", { refreshToken })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        setUser({ role: data.role });
      })
      .catch(() => {
        localStorage.removeItem("refreshToken");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await apiClient.post("/auth/login", { email, password });
    setAccessToken(data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    setUser({ email, role: data.role });
    return data;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    try {
      if (refreshToken) {
        await apiClient.post("/auth/logout", { refreshToken });
      }
    } finally {
      setAccessToken(null);
      localStorage.removeItem("refreshToken");
      setUser(null);
    }
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === "ADMIN",
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
