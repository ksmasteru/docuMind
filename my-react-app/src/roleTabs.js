// Which pages each role sees, the web side of the mobile app's constants/role-tabs.ts
// (UserRole on the backend: USER = technician). The links show in this order, and the first
// one is where the app opens after login.
//
// For most roles this only hides links: a hidden page can still be opened by its URL, so the
// backend has to refuse what a role may not do. Technicians and the workshop roles (LOCKED_ROLES) are also kept to
// their own pages: App.jsx's ProtectedRoute sends any other URL back to their home page.
//
// The report platform (edition.js, plan_rapports_platform.md) has its own, smaller set (RAPPORTS_TABS), and
// keeps every role to its own pages.
import { Activity, Bell, ClipboardCheck, Siren, ClipboardList, Cpu, FileCheck, FileSearch, FileUp, House, LayoutDashboard, ListChecks, MessageSquareText, ShieldCheck, UserCog, Users, Wrench } from "lucide-react";
import { RAPPORTS } from "./edition";

// keyed by the `active` value each page passes to <Layout>
// soon: shown in the sidebar as a coming page, not a link
export const NAV_LINKS = {
  dashboard:   { to: "/dashboard",    label: "Tableau de bord", icon: LayoutDashboard },
  pumps:       { to: "/pumps",        label: "Pompes",          icon: Cpu },
  alerts:      { to: "/alerts",       label: "Alertes",         icon: Bell },
  search:      { to: "/documents",    label: "Documents",       icon: FileSearch },
  upload:      { to: "/upload",       label: "Importer",        icon: FileUp },
  ask:         { to: "/ask",          label: "Assistant",       icon: MessageSquareText },
  tasks:       { to: "/tasks",        label: "Tâches",          icon: ListChecks },
  forms:       { to: "/forms",        label: "Formulaires",     icon: ClipboardCheck },
  technicians: { to: "/technicians",  label: "Techniciens",     icon: Users },
  review:      { to: "/review",       label: "Revue",           icon: ShieldCheck },
  orders:      { to: "/orders",       label: "Ordres",          icon: ClipboardList },
  workshop:    { to: "/atelier",      label: "Atelier",         icon: Wrench },
  followup:    { to: "/suivi",        label: "Suivi",           icon: Activity },
  // the quality forms sent, for the roles their forms let read them, and each person's own (ControlSheets.jsx)
  controls:    { to: "/controles",    label: "Fiches qualité",  icon: FileCheck },
  home:        { to: "/accueil",      label: "Accueil",         icon: House },
  // the technician's alerts: his site's, to check on the spot, and the faults he reports (FieldAlerts.jsx)
  fieldAlerts: { to: "/terrain",      label: "Alertes",         icon: Siren },
  // the super admin's accounts: the managers he creates (AccountsAdmin.jsx, the report platform)
  accounts:    { to: "/comptes",      label: "Comptes",         icon: UserCog },
};

export const ROLE_TABS = {
  MANAGER: ["dashboard", "pumps", "alerts", "technicians", "orders", "review", "forms", "controls", "search", "ask"],
  ADMIN: ["upload", "search", "ask"],
  // technicians fill in forms, follow their tasks and look things up in the manuals
  // and check the alerts of their site, or report a fault the twin did not see
  USER: ["forms", "tasks", "fieldAlerts", "controls", "ask", "search"],
  // the workshop loop (fix_workshop.md): each role works its steps from its queue (Atelier). Every
  // PHOVA role also fills the quality forms (non-conformité, réclamations, dérogation) and finds them,
  // and what their role may read, in Fiches qualité
  SALES: ["workshop", "forms", "controls"],
  BUSINESS_OPS: ["workshop", "forms", "controls"],
  CONTRACT_ADMIN: ["workshop", "forms", "controls"],
  // they also follow the interventions they worked on (Suivi), like the manager's Ordres
  PROJECT_LEAD: ["workshop", "followup", "forms", "controls"],
  WORKSHOP_LEAD: ["workshop", "followup", "forms", "controls"],
  HSE: ["workshop", "forms", "controls"],
  STOREKEEPER: ["workshop", "forms", "controls"],
  // Quality also fills the control sheets (Formulaires) and reads every one sent (Contrôles)
  QUALITY: ["workshop", "forms", "controls"],
  BILLING: ["workshop", "forms", "controls"],
};

// The report platform's pages: three roles. The super admin creates the managers and reads every report;
// a manager sends reports to fill as tasks, and reviews them with the ones his technicians send on their own;
// a technician fills reports (from a task, or on his own) and follows them. Documents and assistant for all
const RAPPORTS_TABS = {
  ADMIN: ["accounts", "review", "search", "upload", "ask"],
  MANAGER: ["review", "orders", "technicians", "search", "ask"],
  USER: ["forms", "tasks", "search", "ask"],
};

// the pages a role reaches from its own on the report platform, though they have no link:
// « Assigner une tâche » (/assign/:email), from Techniciens
const RAPPORTS_EXTRA = { MANAGER: ["/assign"] };

// the workshop roles, kept to their own pages like technicians
const WORKSHOP_ROLES = ["SALES", "BUSINESS_OPS", "CONTRACT_ADMIN", "PROJECT_LEAD", "WORKSHOP_LEAD", "HSE", "STOREKEEPER", "QUALITY", "BILLING"];

// the roles that get the intranet's sidebar; the others keep the top bar
export const SIDEBAR_ROLES = ["MANAGER"];

// how the sidebar groups a role's links; a link outside every section is left out
export const NAV_SECTIONS = [
  { title: "Vue d'ensemble", pages: ["dashboard"] },
  { title: "Parc",           pages: ["pumps", "alerts"] },
  { title: "Maintenance",    pages: ["technicians", "orders", "review", "tasks", "forms"] },
  { title: "Qualité",        pages: ["controls"] },
  { title: "Documentation",  pages: ["search", "ask", "upload"] },
];

// an unknown role gets the technician's links, the smallest set
export const tabsFor = (role) => (RAPPORTS ? RAPPORTS_TABS[role] ?? RAPPORTS_TABS.USER : ROLE_TABS[role] ?? ROLE_TABS.USER);

// roles that may only open their own pages (an old bookmark to /documents goes home instead)
export const LOCKED_ROLES = ["USER", ...WORKSHOP_ROLES];

// whether `role` may be on `path`: one of its links, or a page under one ("/forms/…").
// "Mon compte" (/compte) is everyone's: it has no link in the tabs, only the header's icon.
// On the report platform every role is kept to its pages, so no hidden page opens by its URL
const under = (path, to) => path === to || path.startsWith(`${to}/`);
export const canOpen = (role, path) =>
  (!RAPPORTS && !LOCKED_ROLES.includes(role)) || path === "/compte" ||
  (RAPPORTS && (RAPPORTS_EXTRA[role] ?? []).some((to) => under(path, to))) ||
  tabsFor(role).some((page) => {
    const to = NAV_LINKS[page].to;
    return to && under(path, to);
  });

export const homeFor = (role) => NAV_LINKS[tabsFor(role).find((page) => NAV_LINKS[page].to)].to;
