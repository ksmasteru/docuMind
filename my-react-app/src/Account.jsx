// "Mon compte", for every role (the person icon in the header): who the session belongs to, and
// "Changer mon mot de passe". A technician's account is created by his manager, who sets the first
// password; choosing his own here is what makes his reports' signature his alone.
//
//   account ← GET  /api/v1/users/me            { name, firstName, lastName, email, role, worksite,
//                                                passwordSetBySelf, passwordSetAt }
//   change  → POST /api/v1/users/me/password   { currentPassword, newPassword } → the account
import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import Layout from "./Layout";
import { Button } from "@/components/ui/button";
import { apiClient } from "./apiClient";
import { ErrorBanner, ListSkeleton } from "./managerUi";
import { formatDay, localIso, serverMessage } from "./managerUtils";
import { MicroLabel } from "./dashboard/primitives";
import { ROLE_LABEL } from "./workshopUtils";

const MIN_PASSWORD = 8;
const fieldClass = "mt-1.5 h-10 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const dayOf = (instant) => (instant ? formatDay(localIso(new Date(instant))) : null);

const Fact = ({ label, children }) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
);

function PasswordForm({ onChanged }) {
    const [form, setForm] = useState({ current: "", next: "", again: "" });
    const [shown, setShown] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);
    const set = (key) => (event) => { setForm((f) => ({ ...f, [key]: event.target.value })); setDone(false); };

    const submit = async (event) => {
        event.preventDefault();
        setError(null);
        if (!form.current) return setError("Saisissez votre mot de passe actuel.");
        if (form.next.length < MIN_PASSWORD) return setError(`Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
        if (form.next !== form.again) return setError("Les deux saisies du nouveau mot de passe sont différentes.");
        setSending(true);
        try {
            const { data } = await apiClient.post("/api/v1/users/me/password", { currentPassword: form.current, newPassword: form.next });
            setForm({ current: "", next: "", again: "" });
            setDone(true);
            onChanged(data);
        }
        catch (err) {
            const fields = err.response?.data?.errors;
            setError(fields && Object.keys(fields).length ? Object.values(fields).join(" ") : serverMessage(err, "Le mot de passe n'a pas pu être changé. Réessayez."));
        }
        finally {
            setSending(false);
        }
        return undefined;
    };

    const type = shown ? "text" : "password";
    return (
        <form onSubmit={submit} noValidate className="space-y-3">
            <label className="block text-sm font-medium text-foreground">Mot de passe actuel
                <input type={type} className={fieldClass} value={form.current} onChange={set("current")} autoComplete="current-password" />
            </label>
            <label className="block text-sm font-medium text-foreground">Nouveau mot de passe
                <input type={type} className={fieldClass} value={form.next} onChange={set("next")} autoComplete="new-password" />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">{MIN_PASSWORD} caractères minimum.</span>
            </label>
            <label className="block text-sm font-medium text-foreground">Nouveau mot de passe, encore
                <input type={type} className={fieldClass} value={form.again} onChange={set("again")} autoComplete="new-password" />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} className="size-4 accent-primary" /> Afficher les mots de passe
            </label>
            {error && <p role="alert" className="rounded-sm border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}
            {done && <p role="status" className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="size-4" aria-hidden="true" /> Votre mot de passe est changé.</p>}
            <Button type="submit" disabled={sending}><KeyRound aria-hidden="true" /> {sending ? "Changement…" : "Changer mon mot de passe"}</Button>
        </form>
    );
}

export default function Account() {
    const [account, setAccount] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        let cancelled = false;
        apiClient.get("/api/v1/users/me")
            .then(({ data }) => { if (!cancelled) { setAccount(data); setError(null); } })
            .catch((err) => !cancelled && setError(serverMessage(err, "Votre compte n'a pas pu être chargé. Vérifiez votre connexion et réessayez.")));
        return () => { cancelled = true; };
    }, [attempt]);

    const passwordNote = !account ? null
        : account.passwordSetBySelf == null ? "Vous utilisez un mot de passe donné à la création du compte : choisissez le vôtre."
        : account.passwordSetBySelf ? `Vous avez choisi ce mot de passe le ${dayOf(account.passwordSetAt)}.`
        : `Ce mot de passe a été défini par un responsable le ${dayOf(account.passwordSetAt)} : choisissez le vôtre, pour que vos validations et vos rapports soient signés de vous seul.`;

    return (
        <Layout active="account">
            <MicroLabel>Mon compte</MicroLabel>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{account?.name ?? "Mon compte"}</h1>

            <div className="mt-4">
                {error && <ErrorBanner message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} />}
                {!account && !error && <ListSkeleton />}
                {account && (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded-md border border-border bg-card px-4 py-3" aria-labelledby="identity">
                            <h2 id="identity" className="text-sm font-semibold text-foreground">Identité</h2>
                            <dl className="mt-1 divide-y divide-border">
                                <Fact label="Nom">{account.name}</Fact>
                                <Fact label="E-mail">{account.email}</Fact>
                                <Fact label="Rôle">{ROLE_LABEL[account.role] ?? (account.role === "USER" ? "Technicien" : account.role)}</Fact>
                                {account.worksite && <Fact label="Site">{account.worksite}</Fact>}
                            </dl>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {account.role === "USER"
                                    ? "Vos rapports sont signés de ce nom. S'il est faux, demandez à votre manager de le corriger."
                                    : "Vos validations sont enregistrées sous ce nom."}
                            </p>
                        </section>

                        <section className="rounded-md border border-border bg-card px-4 py-3" aria-labelledby="password">
                            <h2 id="password" className="text-sm font-semibold text-foreground">Mot de passe</h2>
                            <p className="mb-3 mt-1 text-xs text-muted-foreground">{passwordNote}</p>
                            <PasswordForm onChanged={setAccount} />
                        </section>
                    </div>
                )}
            </div>
        </Layout>
    );
}
