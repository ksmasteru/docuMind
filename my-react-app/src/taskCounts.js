// The numbers on the tabs (GET /api/v1/task/counts): what waits for the person signed in.
//   a technician   toDo: tasks to accept and reports sent back to him
//   a manager      toReview: his reports to validate · toReviewAll: every manager's · declined: his tasks a
//                  technician declined, to give to someone else
// Read when the page opens, every minute, and when the window comes back to the front. Silent when the
// server can't answer (or isn't updated yet): the tabs then show no number.
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";

const EVERY = 60000;

export function useTaskCounts() {
    const [counts, setCounts] = useState({});
    useEffect(() => {
        let cancelled = false;
        const load = () => apiClient.get("/api/v1/task/counts")
            .then(({ data }) => !cancelled && setCounts(data ?? {}))
            .catch(() => null);
        load();
        const timer = setInterval(load, EVERY);
        const onFocus = () => document.visibilityState === "visible" && load();
        document.addEventListener("visibilitychange", onFocus);
        return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", onFocus); };
    }, []);
    return counts;
}
