// What the login and sign-up pages may offer (GET /api/auth/options, public). Accounts are created by a
// manager (Techniciens page); the public sign-up is open only when the server says so
// (ALLOW_SELF_REGISTRATION=true). null while it loads, false when the server can't be reached.
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";

export function useSelfRegistration() {
    const [open, setOpen] = useState(null);
    useEffect(() => {
        let cancelled = false;
        apiClient.get("/api/auth/options")
            .then(({ data }) => !cancelled && setOpen(Boolean(data?.selfRegistration)))
            .catch(() => !cancelled && setOpen(false));
        return () => { cancelled = true; };
    }, []);
    return open;
}
