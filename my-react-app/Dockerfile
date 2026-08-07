# --- Build stage: compile the actual production bundle ---
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage: serve the static dist/ output, not the Vite dev server ---
# The dev server (`vite` / `vite preview`) rejects any request whose Host
# header isn't localhost — which is exactly what a platform proxy (Railway,
# etc.) sends. `serve` has no such check and is meant for this.
FROM node:22-alpine

WORKDIR /app
RUN npm install -g serve

COPY --from=build /app/dist ./dist

EXPOSE 5173

# -s = SPA fallback (unmatched routes serve index.html, required for
# react-router-dom client-side routing).
# Honors the platform-injected $PORT if present (e.g. Railway), otherwise
# falls back to 5173 to match this repo's docker-compose port mapping.
CMD ["sh", "-c", "serve -s dist -l ${PORT:-5173}"]
