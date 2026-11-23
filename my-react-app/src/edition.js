// Which platform this build is (Edition.java on the backend, plan_rapports_platform.md):
//   full      documind as a whole (the default)
//   rapports  the report platform PHOVA uses while the rest is built: reports, tasks, team, documents and
//             assistant; no dashboard, pumps, alerts or workshop, and a report needn't name an equipment
// VITE_EDITION in my-react-app/.env, read when the app is built; init-server.sh writes it from .env's APP_EDITION.
export const RAPPORTS = (import.meta.env.VITE_EDITION ?? "").trim().toLowerCase() === "rapports";
