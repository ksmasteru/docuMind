import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Only relevant if `vite dev` / `vite preview` ever ends up running
  // (e.g. Railway falling back to Nixpacks instead of the Dockerfile).
  // The production Dockerfile serves the build with `serve`, which has
  // no host check at all, so this is a safety net, not the primary fix.
  server: {
    allowedHosts: [".up.railway.app", ".ngrok-free.dev"],
    // API calls go through the dev server, so the web app and the phone can share one ngrok address.
    // "backend" is the compose service name: Vite runs in the front_end container, where localhost is itself.
    proxy: {
      "/api": "http://backend:8080",
    },
  },
  // `npm run demo` serves the production build for showing the app through ngrok: the dev server
  // sends ~18 MB of unminified code on first load, too slow over a tunnel. It runs on the Mac,
  // not in Docker, so the backend is on localhost here.
  preview: {
    allowedHosts: [".up.railway.app", ".ngrok-free.dev"],
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});