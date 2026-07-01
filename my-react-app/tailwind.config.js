export default {
  // Class strategy: adding/removing the "dark" class on <html> controls
  // all dark: variants. ThemeContext handles that toggle.
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};