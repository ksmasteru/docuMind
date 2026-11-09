// "Générer le dossier final": the intervention's final file as a PDF, opened in a new tab
// (cover, synthèse, avant / après, mesures, devis, both reports, history; ExpertiseDossierService).
//
//   pdf ← GET /api/v1/interventions/:id/dossier/pdf   (rebuilt on every call, nothing is stored)
//
// The PDF needs the token, so it's fetched here and handed to a tab opened at the click
// (opened after the await, the browser would block it as a pop-up).
import { useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { apiClient } from "./apiClient";
import { serverMessage } from "./managerUtils";

export default function DossierButton({ interventionId, className = "" }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const open = async () => {
        setError(null);
        setBusy(true);
        const tab = window.open("", "_blank");
        try {
            const response = await apiClient.get(`/api/v1/interventions/${interventionId}/dossier/pdf`, { responseType: "blob" });
            const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
            if (tab) tab.location.href = url;
            else window.location.href = url;
        }
        catch (err) {
            console.log("Error while generating the final file", err);
            tab?.close();
            setError(serverMessage(err, "Le dossier final n'a pas pu être généré. Réessayez."));
        }
        finally {
            setBusy(false);
        }
    };

    return (
        <div className={className}>
            <button type="button" onClick={open} disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1A75BC] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-60 sm:w-auto">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                {busy ? "Génération du dossier…" : "Générer le dossier final"}
            </button>
            {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        </div>
    );
}
