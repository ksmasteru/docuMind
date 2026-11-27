// The documents of the pump models (plan_pump_manuals.md part B): what « Importer », « Documents »,
// « Fiches techniques », the pump page, the task page and the chat share.
//
//   models  ← GET /api/v1/pump-models                         (the models a document can be ticked for)
//   open    ← GET /api/v1/files/id/{fileId}                    (a document, in a new tab)
//
// A document ticked for a model is either PHOVA's own (OWN) or the manual of a similar pump taken as reference
// (COMPARABLE: its figures aren't the model's). A model's spec sheet (SPEC) is managed on « Fiches techniques ».
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";

export const KIND_LABEL = { SPEC: "Fiche technique", OWN: "Document PHOVA", COMPARABLE: "Pompe comparable" };

export const KIND_CHIP = {
  SPEC: "border-primary/30 bg-primary/10 text-primary",
  OWN: "border-ok/30 bg-ok/10 text-ok",
  COMPARABLE: "border-warn/30 bg-warn/10 text-warn",
};

// the models, asked once per page load
let modelsRequest = null;
export function usePumpModels() {
  const [models, setModels] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    modelsRequest ??= apiClient.get("/api/v1/pump-models").then(({ data }) => data ?? []);
    modelsRequest
      .then((list) => !cancelled && setModels(list))
      .catch((err) => {
        modelsRequest = null; // the next page tries again
        console.log("Error while fetching the pump models", err);
        if (!cancelled) setError("La liste des modèles n'a pas pu être chargée.");
      });
    return () => { cancelled = true; };
  }, []);
  return { models, error };
}

// the document needs the token, so it's fetched here and handed to a tab opened right away
// (opened after the await, the browser would block it as a pop-up)
export async function openDocument(fileId, title) {
  const tab = window.open("", "_blank");
  try {
    const response = await apiClient.get(`/api/v1/files/id/${encodeURIComponent(fileId)}?inline=true`, { responseType: "blob" });
    const type = response.headers["content-type"] || "application/pdf";
    tab.location.href = URL.createObjectURL(new Blob([response.data], { type }));
  }
  catch (err) {
    console.log("Error while opening a document", err);
    tab?.close();
    window.alert(`« ${title} » n'a pas pu être ouvert.`);
  }
}

export async function downloadDocument(fileId, fileName) {
  const response = await apiClient.get(`/api/v1/files/id/${encodeURIComponent(fileId)}`, { responseType: "blob" });
  const url = URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// a model's kind as ticked: every non-spec link of a document has the same one
export const kindOf = (links) => links?.find((l) => l.kind !== "SPEC")?.kind ?? "OWN";
export const tickedModels = (links) => (links ?? []).filter((l) => l.kind !== "SPEC").map((l) => l.model);
