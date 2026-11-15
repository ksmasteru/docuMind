// The manager's team, the Techniciens tab.
//
//   team    ← GET  /api/v1/team                  { members: [{ id, name, email, worksite, activeTasks,
//                                                  toReview, approved, totalTasks, lastActivityAt }],
//                                                  available: [{ id, name, email, worksite }] }
//   create  → POST /api/v1/team/technicians      { name, email, password, worksite? }: a new account
//   add     → PUT  /api/v1/team/technicians/{id} an existing technician in no team yet
//   (every change answers with the whole team; removing someone is on his page)
//
// A card opens the technician's page (TechnicianProfile.jsx): his profile, performance and task
// history. Opened from a pump or an alert (?equipement=…&alerte=…), the cards' Assigner button
// goes straight to the assign form with them, as before.
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardPlus, UserPlus, UserRoundPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { apiClient } from "./apiClient";
import { EmptyState, ErrorBanner, Notice, PageHeader } from "./managerUi";
import { ago, plural, serverMessage } from "./managerUtils";
import { MicroLabel } from "./dashboard/primitives";
import { TONE } from "./dashboard/tokens";
import { initials, orderQuery } from "./teamUtils";

// the sites a technician can be attached to (phova-worksites)
const WORKSITES = ["Jorf", "Safi"];

const inputClass = "h-9 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground placeholder:text-subtle outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-crit";

export const Avatar = ({ name, size = "md" }) => (
    <span aria-hidden="true"
        className={cn("flex shrink-0 items-center justify-center rounded-sm bg-primary/12 font-data font-semibold text-primary ring-1 ring-inset ring-primary/25",
            size === "lg" ? "size-14 text-lg" : "size-10 text-sm")}>
        {initials(name)}
    </span>
);

const SiteTag = ({ site }) => site
    ? <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{site}</span>
    : null;

// one count of a card; tone only when it asks for the manager (reports waiting for him)
const Count = ({ label, value, tone }) => (
    <div className="min-w-0 px-3 py-2.5">
        <MicroLabel as="dt" className="truncate">{label}</MicroLabel>
        <dd className={cn("mt-0.5 font-data text-lg font-medium tabular-nums leading-tight", tone && value > 0 ? TONE[tone].text : "text-foreground")}>
            {value}
        </dd>
    </div>
);

// now: when the team was loaded, to say how long ago his last activity was
function MemberCard({ member, now, searchParams, onAssign, highlight }) {
    const last = member.lastActivityAt ? `Activité ${ago(now - Date.parse(member.lastActivityAt))}` : "Aucune tâche pour l'instant";
    return (
        <li className="group relative flex flex-col rounded-md border border-border bg-card transition-colors hover:border-input focus-within:border-input">
            <div className="flex items-start gap-3 p-4">
                <Avatar name={member.name} />
                <div className="min-w-0 flex-1">
                    {/* the whole card opens his page; the Assigner button sits above this link */}
                    <Link to={`/technicians/${member.id}${orderQuery(searchParams)}`}
                        className="block truncate font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring">
                        {member.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <SiteTag site={member.worksite} />
            </div>
            <dl className="grid grid-cols-3 divide-x divide-border border-t border-border">
                <Count label="En cours" value={member.activeTasks} />
                <Count label="À valider" value={member.toReview} tone="standby" />
                <Count label="Approuvées" value={member.approved} />
            </dl>
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
                <span className="truncate text-xs text-subtle">{last}</span>
                <Button size="sm" variant={highlight ? "default" : "outline"} className="relative z-10 h-7"
                    onClick={() => onAssign(member)} aria-label={`Assigner une tâche à ${member.name}`}>
                    <ClipboardPlus aria-hidden="true" /> Assigner
                </Button>
            </div>
        </li>
    );
}

const CardsSkeleton = () => (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Chargement">
        {[0, 1, 2].map((i) => (
            <li key={i} className="h-[178px] animate-pulse rounded-md border border-border bg-card" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
    </ul>
);

// the technicians in no team, each with its Ajouter button
function AddPanel({ available, onAdd, onCreate }) {
    const [busy, setBusy] = useState(null);
    const add = async (technician) => {
        setBusy(technician.id);
        await onAdd(technician);
        setBusy(null);
    };
    if (available.length === 0) {
        return (
            <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">Tous les techniciens ont déjà une équipe</p>
                <p className="mt-1 text-sm text-muted-foreground">Créez un compte pour un nouveau technicien.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={onCreate}>
                    <UserRoundPlus aria-hidden="true" /> Nouveau technicien
                </Button>
            </div>
        );
    }
    return (
        <ul className="divide-y divide-border border-y border-border">
            {available.map((technician) => (
                <li key={technician.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={technician.name} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{technician.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{technician.email}{technician.worksite ? ` · ${technician.worksite}` : ""}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => add(technician)}>
                        {busy === technician.id ? "Ajout…" : "Ajouter"}
                    </Button>
                </li>
            ))}
        </ul>
    );
}

const EMPTY_FORM = { name: "", email: "", password: "", worksite: "" };

function validate(form) {
    const errors = {};
    if (!form.name.trim()) errors.name = "Le nom est obligatoire.";
    if (!form.email.trim()) errors.email = "L'e-mail est obligatoire.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Cet e-mail n'est pas valide.";
    if (form.password.length < 6) errors.password = "6 caractères minimum.";
    return errors;
}

// a new technician account, which joins the team
function CreatePanel({ onCreated }) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState(null);
    const [sending, setSending] = useState(false);
    const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

    const submit = async (event) => {
        event.preventDefault();
        const found = validate(form);
        setErrors(found);
        setFormError(null);
        if (Object.keys(found).length) return;
        setSending(true);
        try {
            const body = { name: form.name.trim(), email: form.email.trim(), password: form.password, worksite: form.worksite || null };
            const { data } = await apiClient.post("/api/v1/team/technicians", body);
            onCreated(data, body);
            setForm(EMPTY_FORM);
        }
        catch (err) {
            const fieldErrors = err.response?.data?.errors;
            if (fieldErrors && Object.keys(fieldErrors).length) setErrors(fieldErrors);
            else setFormError(serverMessage(err, "Le compte n'a pas pu être créé. Vérifiez votre connexion et réessayez."));
        }
        finally {
            setSending(false);
        }
    };

    const field = (key, label, input, hint) => (
        <div>
            <label htmlFor={`new-${key}`} className="text-sm font-medium text-foreground">{label}</label>
            <div className="mt-1.5">{input}</div>
            {errors[key]
                ? <p id={`new-${key}-error`} className="mt-1 text-xs text-crit">{errors[key]}</p>
                : hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
    const described = (key) => ({ id: `new-${key}`, "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `new-${key}-error` : undefined });

    return (
        <form onSubmit={submit} noValidate className="space-y-4 px-4">
            {field("name", "Nom complet", <input {...described("name")} className={inputClass} value={form.name} onChange={set("name")} autoComplete="off" placeholder="Prénom Nom" />)}
            {field("email", "E-mail", <input {...described("email")} type="email" className={inputClass} value={form.email} onChange={set("email")} autoComplete="off" placeholder="prenom.nom@phova.com" />,
                "Il se connectera avec cet e-mail.")}
            {field("password", "Mot de passe", <input {...described("password")} type="password" className={inputClass} value={form.password} onChange={set("password")} autoComplete="new-password" />,
                "6 caractères minimum. Communiquez-le-lui : il pourra se connecter tout de suite.")}
            {field("worksite", "Site", (
                <select {...described("worksite")} className={inputClass} value={form.worksite} onChange={set("worksite")}>
                    <option value="">Non précisé</option>
                    {WORKSITES.map((site) => <option key={site} value={site}>{site}</option>)}
                </select>
            ))}
            {formError && <p role="alert" className="rounded-sm border border-crit/30 bg-crit/10 px-3 py-2 text-sm text-crit">{formError}</p>}
            <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Création…" : "Créer le compte"}
            </Button>
        </form>
    );
}

const Technicians = () => {
    const [team, setTeam] = useState(null); // null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const [panel, setPanel] = useState(null); // "add" | "create" | null
    const navigate = useNavigate();
    const notice = useLocation().state?.notice;
    const [searchParams] = useSearchParams();
    const equipment = searchParams.get("equipement");

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const loadTeam = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/team");
                setLoadError(null);
                setTeam({ ...data, loadedAt: Date.now() });
            }
            catch (err) {
                console.log("Error while fetching the team", err);
                setLoadError(serverMessage(err, "L'équipe n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
                setTeam({ members: [], available: [] });
            }
        };
        loadTeam();
    }, [attempt]);

    const onRetry = () => {
        setTeam(null);
        setAttempt((n) => n + 1);
    };

    const assign = (member) => navigate(`/assign/${encodeURIComponent(member.email)}${orderQuery(searchParams, { name: member.name })}`);

    const add = async (technician) => {
        try {
            const { data } = await apiClient.put(`/api/v1/team/technicians/${technician.id}`);
            setTeam({ ...data, loadedAt: Date.now() });
            toast.success(`${technician.name} a rejoint votre équipe`);
            if (data.available.length === 0) setPanel(null);
        }
        catch (err) {
            toast.error("Ajout impossible", { description: serverMessage(err, "Vérifiez votre connexion et réessayez.") });
        }
    };

    const created = (data, body) => {
        setTeam({ ...data, loadedAt: Date.now() });
        setPanel(null);
        toast.success(`Compte créé pour ${body.name}`, { description: `Il peut se connecter avec ${body.email}.` });
    };

    const loading = team === null;
    const members = team?.members ?? [];
    const available = team?.available ?? [];

    return (
    <Layout active="technicians" wide>
        <div className="flex flex-wrap items-end justify-between gap-4">
            <PageHeader title="Techniciens"
                subtitle={equipment
                    ? `Choisissez le technicien de l'ordre sur ${equipment}.`
                    : "Votre équipe. Ouvrez une fiche pour voir son historique et sa performance."} />
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPanel("add")} disabled={loading}>
                    <UserPlus aria-hidden="true" /> Ajouter
                    {available.length > 0 && <span className="rounded-sm bg-primary/15 px-1 font-data text-[10px] font-semibold text-primary">{available.length}</span>}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPanel("create")} disabled={loading}>
                    <UserRoundPlus aria-hidden="true" /> Nouveau technicien
                </Button>
            </div>
        </div>

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-6">
            {loading && <CardsSkeleton />}

            {!loading && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!loading && !loadError && members.length === 0 && (
                <div>
                    <EmptyState icon={<Users className="size-5" aria-hidden="true" />} title="Votre équipe est vide"
                        hint="Ajoutez les techniciens que vous suivez, ou créez un compte pour un nouveau technicien." />
                    <div className="mt-4 flex justify-center gap-2">
                        <Button size="sm" onClick={() => setPanel(available.length ? "add" : "create")}>
                            {available.length ? <><UserPlus aria-hidden="true" /> Ajouter un technicien</> : <><UserRoundPlus aria-hidden="true" /> Créer un compte</>}
                        </Button>
                    </div>
                </div>
            )}

            {!loading && members.length > 0 && (
                <section>
                    <MicroLabel as="h2" className="mb-2">Mon équipe · {members.length} {plural(members.length, "technicien")}</MicroLabel>
                    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {members.map((member) => (
                            <MemberCard key={member.id} member={member} now={team.loadedAt} searchParams={searchParams} onAssign={assign} highlight={Boolean(equipment)} />
                        ))}
                    </ul>
                </section>
            )}
        </div>

        <Sheet open={panel !== null} onOpenChange={(open) => !open && setPanel(null)}>
            <SheetContent className="gap-0 overflow-y-auto font-ui sm:max-w-md">
                <SheetHeader className="mb-2">
                    <SheetTitle>{panel === "create" ? "Nouveau technicien" : "Ajouter à l'équipe"}</SheetTitle>
                    <SheetDescription>
                        {panel === "create"
                            ? "Un compte technicien, qui rejoint votre équipe."
                            : "Les techniciens qui ne sont encore dans aucune équipe."}
                    </SheetDescription>
                </SheetHeader>
                {panel === "add" && <AddPanel available={available} onAdd={add} onCreate={() => setPanel("create")} />}
                {panel === "create" && <CreatePanel onCreated={created} />}
            </SheetContent>
        </Sheet>

        <Toaster position="bottom-right" visibleToasts={3} />
    </Layout>)
}

export default Technicians;
