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
    allowedHosts: [".up.railway.app"],
  },
  preview: {
    allowedHosts: [".up.railway.app"],
  },
});