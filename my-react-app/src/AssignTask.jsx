// A manager fills a task order for one technician and sends it, the mobile app's assign screen.
// Opened from the Technicians page as /assign/:email?name=…&equipement=…, the email identifying the
// technician on the backend; equipement is set when the order was started from a pump, and alerte
// when it answers an alert case: the case then records the order, and the page goes back to it.
//
//   templates ← GET  /api/v1/forms/options   (the active checklists, same list as the Forms page)
//   send      → POST /api/v1/task/new        (TaskCreationDto → { id }; the manager comes from the token)
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { linkOrder } from "./alertStore";
import { PRIORITY_LABEL, PRIORITY_STYLE, TASK_TYPES, localIso, serverMessage } from "./managerUtils";

// TaskPriority on the backend, NORMAL being its default
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

// ChecklistType badges, same wording and colours as the Forms page
const TEMPLATE_TYPES = {
    INSPECTION: { label: "Inspection", style: "bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]" },
    PERMIT: { label: "Permis", style: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
};

const inputClass =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#1A75BC] focus:ring-2 focus:ring-[#1A75BC]/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const AssignTask = () => {
    const { email: technicianEmail } = useParams();
    const [searchParams] = useSearchParams();
    const name = searchParams.get("name");
    const alertNumber = Number(searchParams.get("alerte")) || null;
    const { user } = useAuth();
    const navigate = useNavigate();

    const [title, setTitle] = useState("");
    const [taskType, setTaskType] = useState(null);
    const [priority, setPriority] = useState("NORMAL");
    const [templates, setTemplates] = useState(null); // null while loading
    const [attempt, setAttempt] = useState(0);
    const [templatesError, setTemplatesError] = useState(false);
    const [templateId, setTemplateId] = useState(null);
    const [equipmentId, setEquipmentId] = useState(searchParams.get("equipement") ?? "");
    const [dueDate, setDueDate] = useState(""); // "YYYY-MM-DD", or "" for no deadline
    const [instructions, setInstructions] = useState("");
    const [sending, setSending] = useState(false);
    const [errors, setErrors] = useState([]);

    // only active templates come back, so anything listed can be sent
    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const loadTemplates = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/forms/options");
                setTemplatesError(false);
                setTemplates([...(data.FormItem ?? [])].sort((a, b) => a.title.localeCompare(b.title)));
            }
            catch (err) {
                console.log("Error while fetching checklists", err);
                setTemplatesError(true);
                setTemplates([]);
            }
        };
        loadTemplates();
    }, [attempt]);

    const retryTemplates = () => {
        setTemplates(null);
        setAttempt((n) => n + 1);
    };

    // the fields TaskCreationDto refuses when missing, plus the checklist: optional
    // on the server, but every order sent from here comes with one
    const ready = title.trim() !== "" && taskType !== null && templateId !== null && equipmentId.trim() !== "";

    const submit = async (e) => {
        e.preventDefault();
        setSending(true);
        setErrors([]);
        try {
            const { data } = await apiClient.post("/api/v1/task/new", {
                title: title.trim(),
                taskType,
                priority,
                templateId,
                technicianEmail,
                equipmentId: equipmentId.trim(),
                instructions: instructions.trim() || null,
                dueDate: dueDate || null,
            });
            const notice = `« ${title.trim()} » a été envoyée à ${name || technicianEmail}.`;
            if (alertNumber) {
                linkOrder(alertNumber, { taskId: data?.id, title: title.trim(), technicianEmail }, user?.email ?? "Manager");
                navigate(`/alerts/${alertNumber}?vue=ordres`, { state: { notice } });
            }
            else navigate("/technicians", { state: { notice } });
        }
        catch (err) {
            console.log("Error while creating task", err);
            const fieldErrors = err.response?.data?.errors ? Object.values(err.response.data.errors) : [];
            setErrors(fieldErrors.length ? fieldErrors : [serverMessage(err, "La tâche n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.")]);
            setSending(false);
        }
    };

    return (
    <Layout active="technicians">
        <Link to="/technicians" className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            ← Techniciens
        </Link>

        <header className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Nouvelle tâche</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Pour <span className="font-medium text-slate-700 dark:text-slate-200">{name || technicianEmail}</span>
                {name && <> · {technicianEmail}</>}
            </p>
        </header>

        <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <Field label="Titre" required>
                <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={sending}
                    placeholder="ex. Remplacer la garniture de la pompe P2" className={inputClass} />
            </Field>

            <Field label="Type d'intervention" required>
                <Chips options={TASK_TYPES} value={taskType} onChange={setTaskType} disabled={sending} />
            </Field>

            <Field label="Priorité">
                <Chips
                    options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p], selectedStyle: PRIORITY_STYLE[p] }))}
                    value={priority} onChange={setPriority} disabled={sending} />
            </Field>

            <Field label="Rapport à remplir" required>
                <TemplatePicker templates={templates} error={templatesError} value={templateId}
                    onChange={setTemplateId} onRetry={retryTemplates} disabled={sending} />
            </Field>

            <Field label="Équipement" required>
                <input value={equipmentId} onChange={(e) => setEquipmentId(e.target.value.toUpperCase())} disabled={sending}
                    placeholder="ex. MP1" autoComplete="off" className={inputClass} />
            </Field>

            <Field label="Échéance">
                <div className="flex items-center gap-2">
                    <input type="date" value={dueDate} min={localIso(new Date())} onChange={(e) => setDueDate(e.target.value)}
                        disabled={sending} className={`${inputClass} max-w-xs`} />
                    {dueDate && (
                        <button type="button" onClick={() => setDueDate("")} disabled={sending}
                            className="mt-1 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                            Effacer
                        </button>
                    )}
                </div>
            </Field>

            <Field label="Instructions">
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} disabled={sending} rows={4}
                    placeholder="Ce que le technicien doit savoir avant d'aller sur site" className={inputClass} />
            </Field>

            {errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {errors.map((message) => <p key={message}>{message}</p>)}
                </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                {!ready && <p className="text-sm text-slate-500 dark:text-slate-400">Le titre, le type, la checklist et l'équipement sont obligatoires.</p>}
                <button type="submit" disabled={!ready || sending}
                    className="rounded-lg bg-[#1A75BC] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                    {sending ? "Envoi…" : "Assigner la tâche"}
                </button>
            </div>
        </form>
    </Layout>)
}

const Field = ({ label, required, children }) => (
    <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {label} {required && <span className="text-red-600 dark:text-red-400">*</span>}
        </p>
        {children}
    </div>
);

// one choice out of a few; the selected chip takes the option's colour
const Chips = ({ options, value, onChange, disabled }) => (
    <div role="radiogroup" className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => {
            const selected = value === option.value;
            return (
            <button key={option.value} type="button" role="radio" aria-checked={selected} disabled={disabled}
                onClick={() => onChange(option.value)}
                className={`rounded-full border px-3 py-1 text-sm transition disabled:opacity-60 ${
                    selected
                        ? `border-transparent font-semibold ${option.selectedStyle ?? "bg-[#1A75BC]/10 text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]"}`
                        : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}>
                {option.label}
            </button>)
        })}
    </div>
);

// The active checklist templates as radio rows. Loading, a failed load (with retry) and
// "none active" each get their own line instead of the list.
const TemplatePicker = ({ templates, error, value, onChange, onRetry, disabled }) => {
    const stateLine = "mt-1.5 text-sm text-slate-500 dark:text-slate-400";

    if (templates === null) return <p className={stateLine}>Chargement des checklists…</p>;

    if (error)
        return (
            <p className="mt-1.5 text-sm text-red-700 dark:text-red-300">
                Les checklists n'ont pas pu être chargées.{" "}
                <button type="button" onClick={onRetry} className="font-medium underline hover:no-underline">Réessayer</button>
            </p>
        );

    if (templates.length === 0) return <p className={stateLine}>Aucune checklist active pour le moment.</p>;

    return (
    <div role="radiogroup" className="mt-1.5 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-300 dark:divide-slate-700 dark:border-slate-600">
        {templates.map((template) => {
            const selected = value === template.id;
            const type = TEMPLATE_TYPES[template.type];
            return (
            <label key={template.id}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition ${
                    selected ? "bg-[#1A75BC]/10 dark:bg-[#5BC6E8]/10" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}>
                <input type="radio" name="template" checked={selected} disabled={disabled}
                    onChange={() => onChange(template.id)} className="accent-[#1A75BC]" />
                <span className="flex-1 text-slate-800 dark:text-slate-200">{template.title}</span>
                {type && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${type.style}`}>{type.label}</span>}
            </label>)
        })}
    </div>);
};

export default AssignTask;
