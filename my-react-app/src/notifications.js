// The bell's number (GET /api/v1/notifications/unread-count): what is new for the person signed in.
// Read when the page opens, every 30 s, and when the window comes back to the front, like the tabs'
// counts (taskCounts.js). Silent when the server can't answer: the bell then shows no number.
// refresh(): read again now, after the list was opened or marked read.
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "./apiClient";

const EVERY = 30000;

export function useUnreadCount() {
    const [unread, setUnread] = useState(0);
    const refresh = useCallback(() => apiClient.get("/api/v1/notifications/unread-count")
        .then(({ data }) => setUnread(data?.unread ?? 0))
        .catch(() => null), []);
    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, EVERY);
        const onFocus = () => document.visibilityState === "visible" && refresh();
        document.addEventListener("visibilitychange", onFocus);
        return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onFocus); };
    }, [refresh]);
    return [unread, refresh];
}
