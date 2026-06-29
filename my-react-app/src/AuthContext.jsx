import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiClient, setAccessToken, setAuthChangeHandler } from "./apiClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Let apiClient push state changes back here when it silently refreshes
  // or gives up and logs the user out from inside a 401 handler.
  useEffect(() => {
    setAuthChangeHandler((data) => setUser(data)); // ???
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
    
    setAccessToken(data.accessToken);
    
    localStorage.setItem("refreshToken", data.refreshToken);
    
    setUser({ email, role: data.Role });
    
    console.log(`data is ${JSON.stringify(data)}`);
    console.log(`user role is ${data.Role}`);
    console.log(`data is ${data}`);
    
    return data;
  }, []);

  const logout = useCallback(async () => {
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
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
