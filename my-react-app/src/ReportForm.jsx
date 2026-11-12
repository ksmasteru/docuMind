// A form to fill in, whichever it is: the v2 expertise reports ("Rapport d'expertise V2 …") and the
// quality control sheets (layout CONTROL_SHEET) open as the section-by-section wizard (ReportWizard.jsx,
// report_ui.md), every other form as before
// (InspectionForm.jsx). Used by the Formulaires page and the task page's Rapport tab.
//
//   template ← GET /api/v1/forms/inspectionForm/:id   (InspectionForm loads it again for itself)
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";
import InspectionForm from "./InspectionForm";
import ReportWizard from "./ReportWizard";
import { isV2Title } from "./reportV2";

// ticketId: a quality form saved to finish later, resumed from « Fiches en cours » (ReportWizard's ticket mode)
export default function ReportForm({ id, taskId = null, initialEquipment = "", onSubmitted, ticketId = null, onTicket }) {
    const [template, setTemplate] = useState(null); // null = still loading
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await apiClient.get(`/api/v1/forms/inspectionForm/${id}`);
                setFailed(false);
                setTemplate(data);
            }
            catch (err) {
                console.log("Error while fetching the form", err);
                setFailed(true);
            }
        };
        load();
    }, [id, attempt]);

    if (failed)
        return (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                Le formulaire n'a pas pu être chargé.{" "}
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-medium underline">Réessayer</button>
            </p>
        );
    if (template === null)
        return <p className="text-sm text-slate-500 dark:text-slate-400">Chargement du formulaire…</p>;

    // the v2 reports and the quality control sheets (layout CONTROL_SHEET) go through the section wizard
    return isV2Title(template.title) || template.layout === "CONTROL_SHEET"
        ? <ReportWizard template={template} taskId={taskId} initialEquipment={initialEquipment} onSubmitted={onSubmitted} ticketId={ticketId} onTicket={onTicket} />
        : <InspectionForm id={id} taskId={taskId} initialEquipment={initialEquipment} onSubmitted={onSubmitted} />;
}
