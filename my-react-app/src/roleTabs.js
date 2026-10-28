// Which pages each role sees, the web side of the mobile app's constants/role-tabs.ts
// (UserRole on the backend: USER = technician). The links show in this order, and the first
// one is where the app opens after login.
//
// This only hides links: a hidden page can still be opened by its URL, so the backend
// has to refuse what a role may not do.
import { Bell, ClipboardCheck, ClipboardList, Cpu, FileSearch, FileUp, LayoutDashboard, ListChecks, MessageSquareText, ShieldCheck, Users } from "lucide-react";

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
};

export const ROLE_TABS = {
  MANAGER: ["dashboard", "pumps", "alerts", "technicians", "orders", "review", "search", "ask"],
  ADMIN: ["upload", "search", "ask"],
  // technicians only fill in forms, like the mobile app's expertise build
  USER: ["forms"],
};

// the roles that get the intranet's sidebar; the others keep the top bar
export const SIDEBAR_ROLES = ["MANAGER"];

// how the sidebar groups a role's links; a link outside every section is left out
export const NAV_SECTIONS = [
  { title: "Vue d'ensemble", pages: ["dashboard"] },
  { title: "Parc",           pages: ["pumps", "alerts"] },
  { title: "Maintenance",    pages: ["technicians", "orders", "review", "tasks", "forms"] },
  { title: "Documentation",  pages: ["search", "ask", "upload"] },
];

// an unknown role gets the technician's links, the smallest set
export const tabsFor = (role) => ROLE_TABS[role] ?? ROLE_TABS.USER;

export const homeFor = (role) => NAV_LINKS[tabsFor(role).find((page) => NAV_LINKS[page].to)].to;
