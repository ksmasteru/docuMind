import { createContext, useContext, useEffect, useState } from "react";

// The app opens in dark mode unless the user picked light with the toggle; the choice is kept
// in this browser. A new key, so the "light" the old version wrote on every visit (whether or
// not anyone touched the toggle) doesn't keep everyone in light mode.
// index.html reads the same key to set the class before the first paint (no light flash).
export const THEME_KEY = "greensense.theme";

function storedIsDark() {
  try {
    return localStorage.getItem(THEME_KEY) !== "light";
  } catch {
    return true; // private window or blocked storage: the default
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(storedIsDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // only an actual choice is saved, so the default can still change later
  const toggle = () =>
    setIsDark((dark) => {
      try { localStorage.setItem(THEME_KEY, dark ? "light" : "dark"); }
      catch { /* the choice still holds for this tab */ }
      return !dark;
    });

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside a ThemeProvider");
  return ctx;
}
