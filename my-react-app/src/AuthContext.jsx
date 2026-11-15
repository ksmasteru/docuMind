import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiClient, setAccessToken, setAuthChangeHandler } from "./apiClient";
// the alert cases are per user (a technician sees his site's): a new session starts without the last one's
import { resetAlerts } from "./alertStore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // apiClient calls this from its 401 handler with the new access token after a silent
  // refresh (same person, same role: the user stays as is), or with null when the refresh
  // failed: then the session is over.
  useEffect(() => {
    setAuthChangeHandler((token) => {
      if (!token) setUser(null);
    });
  }, []);

  // On first load there's no access token in memory (page was refreshed or
  // this is a new tab) — try to mint one from the refresh token in
  // localStorage before rendering protected content.
  useEffect(() => {
    // Declare an inner async function inside the effect
    const initializeAuth = async () => {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await apiClient.post("/api/auth/refresh", { refreshToken });
        setAccessToken(data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        setUser({ role: data.Role });
      } catch (error) {
        localStorage.removeItem("refreshToken");
      } finally {
        setIsLoading(false);
      }
    };

    // Execute the async function immediately
    initializeAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    
    const { data } = await apiClient.post("/api/auth/login", { email, password });
    resetAlerts();
    
    setAccessToken(data.accessToken);
    
    localStorage.setItem("refreshToken", data.refreshToken);
    
    setUser({ email, role: data.Role });

    return data;
  }, []);

  // A manager's login link (LinkLogin.jsx, /t/:token): the server swaps its token for the
  // same tokens /login returns, so the session that follows is an ordinary one.
  const loginWithLink = useCallback(async (token) => {
    const { data } = await apiClient.post("/api/auth/link", { token });
    resetAlerts();
    setAccessToken(data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    setUser({ role: data.Role });
    return data;
  }, []);

  const logout = useCallback(async () => {
    resetAlerts();
    const refreshToken = localStorage.getItem("refreshToken");
    try {
      if (refreshToken) {
        await apiClient.post("/api/auth/logout", { "refreshToken" : refreshToken });
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
    loginWithLink,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
