// « Comptes » (/comptes), the super admin's page on the report platform (plan_rapports_platform.md): every
// account, and « Nouveau manager ». Each manager then creates his technicians on his « Techniciens » page,
// which puts them in his team: their own reports go to him. The admin sets a manager's first password; the
// manager chooses his own in « Mon compte ».
//
//   accounts ← GET    /api/v1/users                    ({ users: [{ name, email, role }] })
//   manager  → POST   /api/auth/register_manager       ({ name, email, password }, admin only)
//   remove   → DELETE /api/v1/users/:email             (admin only)
import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import Layout from "./Layout";
import { Button } from "@/components/ui/button";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { Card, ErrorBanner, ListSkeleton, Notice, PageHeader } from "./managerUi";
import { serverMessage } from "./managerUtils";

const MIN_PASSWORD = 8;
const ROLE = { ADMIN: "Super admin", MANAGER: "Manager", USER: "Technicien" };
// the managers first, then the technicians; the admin last
const ORDER = { MANAGER: 0, USER: 1, ADMIN: 2 };
const fieldClass = "mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60";

function ManagerForm({ onCreated, onCancel }) {
    const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError(null);
        if (form.password.length < MIN_PASSWORD) return setError(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
        setBusy(true);
        const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
        try {
            await apiClient.post("/api/auth/register_manager", { name, email: form.email.trim(), password: form.password });
            onCreated(name, form.email.trim());
        }
        catch (err) {
            const fields = err.response?.data?.errors;
            setError(fields && Object.keys(fields).length ? Object.values(fields).join(" ") : serverMessage(err, "Le compte n'a pas pu être créé. Réessayez."));
        }
        finally {
            setBusy(false);
        }
        return undefined;
    };

    const ready = form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.password;
    return (
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-foreground">Prénom
                <input value={form.firstName} onChange={set("firstName")} disabled={busy} autoComplete="off" className={fieldClass} />
            </label>
            <label className="block text-sm font-medium text-foreground">Nom
                <input value={form.lastName} onChange={set("lastName")} disabled={busy} autoComplete="off" className={fieldClass} />
            </label>
            <label className="block text-sm font-medium text-foreground">E-mail
                <input type="email" inputMode="email" value={form.email} onChange={set("email")} disabled={busy} autoComplete="off" className={fieldClass} />
            </label>
            <label className="block text-sm font-medium text-foreground">Premier mot de passe
                <input type="text" value={form.password} onChange={set("password")} disabled={busy} autoComplete="new-password" className={fieldClass} />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">{MIN_PASSWORD} caractères minimum. Le manager choisira le sien dans « Mon compte ».</span>
            </label>
            {error && <p role="alert" className="rounded-sm border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit sm:col-span-2">{error}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>
                <Button type="submit" disabled={busy || !ready}>{busy ? "Création…" : "Créer le manager"}</Button>
            </div>
        </form>
    );
}

export default function AccountsAdmin() {
    const { user } = useAuth();
    const [users, setUsers] = useState(null); // null = still loading
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [creating, setCreating] = useState(false);
    const [notice, setNotice] = useState(null);
    const [removing, setRemoving] = useState(null);

    useEffect(() => {
        let cancelled = false;
        apiClient.get("/api/v1/users")
            .then(({ data }) => { if (!cancelled) { setUsers(data.users ?? []); setError(null); } })
            .catch((err) => !cancelled && setError(serverMessage(err, "Les comptes n'ont pas pu être chargés.")));
        return () => { cancelled = true; };
    }, [attempt]);

    const remove = async (account) => {
        if (!window.confirm(`Supprimer le compte de ${account.name} (${account.email}) ? Ses rapports restent, mais il ne pourra plus se connecter.`)) return;
        setRemoving(account.email);
        setNotice(null);
        try {
            await apiClient.delete(`/api/v1/users/${encodeURIComponent(account.email)}`);
            setUsers((list) => list.filter((u) => u.email !== account.email));
            setNotice(`Compte de ${account.name} supprimé.`);
        }
        catch (err) {
            setError(serverMessage(err, `Le compte de ${account.name} n'a pas pu être supprimé.`));
        }
        finally {
            setRemoving(null);
        }
    };

    const sorted = [...(users ?? [])].sort((a, b) => (ORDER[a.role] ?? 3) - (ORDER[b.role] ?? 3) || a.name.localeCompare(b.name));
    const count = (role) => (users ?? []).filter((u) => u.role === role).length;

    return (
        <Layout active="accounts">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <PageHeader title="Comptes"
                    subtitle={users ? `${count("MANAGER")} manager${count("MANAGER") > 1 ? "s" : ""} · ${count("USER")} technicien${count("USER") > 1 ? "s" : ""}` : "Les managers et leurs techniciens."} />
                {!creating && <Button onClick={() => { setCreating(true); setNotice(null); }}><UserPlus aria-hidden="true" /> Nouveau manager</Button>}
            </div>
            {notice && <Notice>{notice}</Notice>}

            {creating && (
                <Card title="Nouveau manager" subtitle="Il crée ensuite ses techniciens sur sa page « Techniciens » : leurs rapports lui reviennent." className="mt-6">
                    <ManagerForm onCancel={() => setCreating(false)}
                        onCreated={(name, email) => { setCreating(false); setNotice(`Manager ${name} créé (${email}). Donnez-lui son mot de passe : il le changera dans « Mon compte ».`); setAttempt((n) => n + 1); }} />
                </Card>
            )}

            <div className="mt-6">
                {error && <ErrorBanner message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} />}
                {!error && users === null && <ListSkeleton />}
                {sorted.length > 0 && (
                    <ul className="divide-y divide-border rounded-md border border-border bg-card">
                        {sorted.map((u) => (
                            <li key={u.email} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-foreground">{u.name}</span>
                                    <span className="block text-xs text-muted-foreground">{u.email}</span>
                                </span>
                                <span className="rounded-sm border border-border px-1.5 font-data text-[10px] uppercase tracking-wider text-subtle">{ROLE[u.role] ?? u.role}</span>
                                {u.email !== user?.email && u.role !== "ADMIN" && (
                                    <Button variant="ghost" size="icon-sm" onClick={() => remove(u)} disabled={removing === u.email}
                                        aria-label={`Supprimer le compte de ${u.name}`} title="Supprimer le compte">
                                        <Trash2 aria-hidden="true" />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Layout>
    );
}
