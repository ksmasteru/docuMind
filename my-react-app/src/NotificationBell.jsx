// The notifications' bell, in both headers (Layout.jsx's TopBar, AppShell.jsx): the unread count, and
// the list it opens. Clicking a line marks it read and opens its page. NotificationService on the
// backend decides who is told what (plan_notifications_registry_stock_signatures.md, §1).
//
//   count ← GET  /api/v1/notifications/unread-count   (notifications.js, every 30 s)
//   list  ← GET  /api/v1/notifications                 ({ notifications, unread }, when opened)
//   read  → POST /api/v1/notifications/:id/read
//   all   → POST /api/v1/notifications/read-all
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck, ClipboardCheck, Inbox, ListChecks, Package, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "./apiClient";
import { useUnreadCount } from "./notifications";
import { ago } from "./managerUtils";

// NotificationKind on the backend
const KIND_ICON = { TASK: ListChecks, REVIEW: ClipboardCheck, WORKSHOP: Wrench, STOCK: Package, INFO: Inbox };

export default function NotificationBell({ className }) {
    const [unread, refresh] = useUnreadCount();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState(null); // null = not loaded yet
    const [error, setError] = useState(false);
    const [loadedAt, setLoadedAt] = useState(0); // when the list was read: the "il y a …" count from it
    const box = useRef(null);
    const navigate = useNavigate();

    const load = () => apiClient.get("/api/v1/notifications")
        .then(({ data }) => { setItems(data.notifications ?? []); setLoadedAt(Date.now()); setError(false); })
        .catch(() => setError(true));

    const toggle = () => {
        if (!open) load();
        setOpen((o) => !o);
    };

    // a click outside or Escape closes it
    useEffect(() => {
        if (!open) return undefined;
        const onClick = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
    }, [open]);

    const openItem = async (item) => {
        if (!item.read) {
            setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
            await apiClient.post(`/api/v1/notifications/${item.id}/read`).catch(() => null);
            refresh();
        }
        if (item.link) {
            setOpen(false);
            navigate(item.link);
        }
    };

    const readAll = async () => {
        await apiClient.post("/api/v1/notifications/read-all").catch(() => null);
        setItems((list) => (list ?? []).map((n) => ({ ...n, read: true })));
        refresh();
    };

    const label = unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications";

    return (
        <div ref={box} className="relative">
            <button type="button" onClick={toggle} aria-label={label} title="Notifications" aria-expanded={open}
                className={cn("relative", className)}>
                <Inbox className="size-4" />
                {unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-data text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div role="dialog" aria-label="Notifications"
                    className="absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-border bg-card text-foreground shadow-xl">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                        <p className="text-sm font-semibold">Notifications</p>
                        <div className="flex items-center gap-1">
                            {items?.some((n) => !n.read) && (
                                <button type="button" onClick={readAll}
                                    className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                                    <CheckCheck className="size-3.5" aria-hidden="true" /> Tout marquer comme lu
                                </button>
                            )}
                            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer"
                                className="rounded-sm p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                                <X className="size-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-y-auto overscroll-contain">
                        {error && <p className="px-3 py-6 text-center text-sm text-crit">Les notifications n'ont pas pu être chargées.</p>}
                        {!error && items === null && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Chargement…</p>}
                        {!error && items?.length === 0 && (
                            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Rien de nouveau pour l'instant.</p>
                        )}
                        {!error && items?.length > 0 && (
                            <ul className="divide-y divide-border">
                                {items.map((n) => {
                                    const Icon = KIND_ICON[n.kind] ?? Inbox;
                                    return (
                                        <li key={n.id}>
                                            <button type="button" onClick={() => openItem(n)}
                                                className={cn("flex w-full gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent",
                                                    !n.read && "bg-primary/[0.06]")}>
                                                <Icon className={cn("mt-0.5 size-4 shrink-0", n.read ? "text-subtle" : "text-primary")} aria-hidden="true" />
                                                <span className="min-w-0 flex-1">
                                                    <span className={cn("block text-sm leading-snug", n.read ? "text-muted-foreground" : "font-medium text-foreground")}>{n.title}</span>
                                                    {n.body && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{n.body}</span>}
                                                    <span className="mt-1 block font-data text-[10px] text-subtle">{ago(loadedAt - new Date(n.createdAt).getTime())}</span>
                                                </span>
                                                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="non lue" />}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
