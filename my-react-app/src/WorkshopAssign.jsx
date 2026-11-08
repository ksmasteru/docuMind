// The Workshop Lead's task order at step 7 (Affecter équipe) or 15 (Autoriser montage): the same
// order a manager sends from the Technicians page (AssignTask.jsx), for the intervention's pump.
// Sending it validates the step and moves the intervention to the technician's step (8 / 16).
//
//   details     ← GET  /api/v1/interventions/:id     (canAssign: the caller took step 7 / 15)
//   technicians ← GET  /api/v1/users/technicians     ({ technicianInfo: [{ name, email, worksite }] })
//   templates   ← GET  /api/v1/forms/options         (the active checklists: only the "Rapport d'expertise" ones are offered)
//   send        → POST /api/v1/interventions/:id/assign   (InterventionAssignDto → { taskId })
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "./apiClient";
import { ErrorBanner, ListSkeleton } from "./managerUi";
import { PRIORITY_LABEL, PRIORITY_STYLE, TASK_TYPES, localIso, serverMessage } from "./managerUtils";
import { Chips, TemplatePicker } from "./AssignTask";
import { DISMANTLING_FORM_TITLE, MOUNTING_FORM_TITLE } from "./expertiseComplet";
import { isExpertiseTitle } from "./expertiseForm";
import { Field } from "./WorkshopRequest";
import { UrgentBadge } from "./Workshop";
import { inputClass, stepLabel } from "./workshopUtils";

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

// what each assigning step sends the technician to do, and the form it pre-selects
const STEP_ORDER = {
    AFFECTER_EQUIPE:   { title: "Démontage + expertise", template: DISMANTLING_FORM_TITLE },
    AUTORISER_MONTAGE: { title: "Montage + essais",      template: MOUNTING_FORM_TITLE },
};

const WorkshopAssign = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [details, setDetails] = useState(null); // null = still loading
    const [technicians, setTechnicians] = useState(null);
    const [templates, setTemplates] = useState(null);
    const [templatesError, setTemplatesError] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [attempt, setAttempt] = useState(0);

    const [technicianEmail, setTechnicianEmail] = useState(null);
    const [title, setTitle] = useState("");
    const [taskType, setTaskType] = useState("CORRECTIVE");
    const [priority, setPriority] = useState("NORMAL");
    const [templateId, setTemplateId] = useState(null);
    const [dueDate, setDueDate] = useState("");
    const [instructions, setInstructions] = useState("");
    const [sending, setSending] = useState(false);
    const [errors, setErrors] = useState([]);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const load = async () => {
            let wanted = null; // the step's report, pre-selected once the forms are in
            try {
                const [{ data: intervention }, { data: list }] = await Promise.all([
                    apiClient.get(`/api/v1/interventions/${id}`),
                    apiClient.get("/api/v1/users/technicians"),
                ]);
                setLoadError(null);
                setDetails(intervention);
                setTechnicians([...(list.technicianInfo ?? [])].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")));
                const order = STEP_ORDER[intervention.currentStep.code];
                setTitle(`${order?.title ?? intervention.currentStep.label} · ${intervention.equipmentId}`);
                setPriority(intervention.urgent ? "URGENT" : "NORMAL");
                setInstructions(intervention.fault ?? "");
                wanted = order?.template ?? null;
            }
            catch (err) {
                console.log("Error while loading the assignment", err);
                setLoadError(serverMessage(err, "L'intervention n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
            }
            try {
                const { data } = await apiClient.get("/api/v1/forms/options");
                setTemplatesError(false);
                // the server refuses any other form on these steps
                const list = (data.FormItem ?? []).filter((t) => isExpertiseTitle(t.title)).sort((a, b) => a.title.localeCompare(b.title));
                setTemplates(list);
                setTemplateId((current) => current ?? list.find((t) => t.title === wanted)?.id ?? null);
            }
            catch (err) {
                console.log("Error while fetching checklists", err);
                setTemplatesError(true);
                setTemplates([]);
            }
        };
        load();
    }, [id, attempt]);

    const retry = () => {
        setDetails(null);
        setTemplates(null);
        setAttempt((n) => n + 1);
    };

    const ready = technicianEmail !== null && title.trim() !== "" && taskType !== null && templateId !== null;

    const submit = async (e) => {
        e.preventDefault();
        setSending(true);
        setErrors([]);
        try {
            await apiClient.post(`/api/v1/interventions/${id}/assign`, {
                technicianEmail,
                title: title.trim(),
                taskType,
                priority,
                templateId,
                dueDate: dueDate || null,
                instructions: instructions.trim() || null,
            });
            const technician = technicians.find((t) => t.email === technicianEmail);
            navigate("/atelier", { state: { notice:
                `${details.number} : « ${title.trim()} » a été envoyée à ${technician?.name || technicianEmail}.` } });
        }
        catch (err) {
            console.log("Error while assigning the technician", err);
            const fieldErrors = err.response?.data?.errors ? Object.values(err.response.data.errors) : [];
            setErrors(fieldErrors.length ? fieldErrors : [serverMessage(err, "La tâche n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.")]);
            setSending(false);
        }
    };

    const backLink = (
        <Link to={`/atelier/${id}`} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            ← {details?.number ?? "Intervention"}
        </Link>
    );

    if (details === null) {
        return (
        <Layout active="workshop">
            {backLink}
            <div className="mt-4">{loadError ? <ErrorBanner message={loadError} onRetry={retry} /> : <ListSkeleton />}</div>
        </Layout>)
    }

    return (
    <Layout active="workshop">
        {backLink}

        <header className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Affecter un technicien</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                {details.number} · {details.equipmentId} · {stepLabel(details.currentStep)}
                {details.urgent && <UrgentBadge />}
            </p>
        </header>

        {!details.canAssign ? (
            <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                Pour affecter un technicien, prenez d'abord cette étape en charge depuis la page de l'intervention.
            </p>
        ) : (
        <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <Field label="Technicien" required>
                <TechnicianPicker technicians={technicians} value={technicianEmail} onChange={setTechnicianEmail} disabled={sending} />
            </Field>

            <Field label="Titre" required>
                <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={sending} className={inputClass} />
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
                    onChange={setTemplateId} onRetry={retry} disabled={sending} />
            </Field>

            <Field label="Échéance">
                <input type="date" value={dueDate} min={localIso(new Date())} onChange={(e) => setDueDate(e.target.value)}
                    disabled={sending} className={`${inputClass} max-w-xs`} />
            </Field>

            <Field label="Instructions">
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} disabled={sending} rows={4}
                    className={inputClass} />
            </Field>

            {errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {errors.map((message) => <p key={message}>{message}</p>)}
                </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                {!ready && <p className="text-sm text-slate-500 dark:text-slate-400">Le technicien, le titre, le type et le rapport sont obligatoires.</p>}
                <button type="submit" disabled={!ready || sending}
                    className="rounded-lg bg-[#1A75BC] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                    {sending ? "Envoi…" : "Assigner la tâche"}
                </button>
            </div>
        </form>
        )}
    </Layout>)
}

// the technicians as radio rows, like the form list
const TechnicianPicker = ({ technicians, value, onChange, disabled }) => {
    if (technicians.length === 0)
        return <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Aucun technicien enregistré.</p>;
    return (
    <div role="radiogroup" className="mt-1.5 max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-300 dark:divide-slate-700 dark:border-slate-600">
        {technicians.map((technician) => {
            const selected = value === technician.email;
            return (
            <label key={technician.email}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition ${
                    selected ? "bg-[#1A75BC]/10 dark:bg-[#5BC6E8]/10" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}>
                <input type="radio" name="technician" checked={selected} disabled={disabled}
                    onChange={() => onChange(technician.email)} className="accent-[#1A75BC]" />
                <span className="min-w-0 flex-1">
                    <span className="block text-slate-800 dark:text-slate-200">{technician.name || technician.email}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{technician.email}</span>
                </span>
                {technician.worksite && <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{technician.worksite}</span>}
            </label>)
        })}
    </div>);
};

export default WorkshopAssign;
