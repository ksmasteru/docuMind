// « Fiches techniques »: every pump model's spec sheet (plan_pump_manuals.md §7), for everyone who works on pumps;
// the admin keeps them up to date here (SpecSheetCard).
//
//   sheets ← GET /api/v1/specs      (one entry per model, with or without a sheet)
//
// /fiches?modele=PHB3 (the task page's link) shows that model's card first and highlights it.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "./Layout";
import { useAuth } from "./AuthContext";
import { apiClient } from "./apiClient";
import { ErrorBanner, ListSkeleton, PageHeader } from "./managerUi";
import { serverMessage } from "./managerUtils";
import SpecSheetCard from "./SpecSheetCard";

export default function SpecSheets() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const wanted = params.get("modele")?.toUpperCase() ?? null;
  const [sheets, setSheets] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiClient.get("/api/v1/specs")
      .then(({ data }) => !cancelled && setSheets(data ?? []))
      .catch((err) => {
        console.log("Error while fetching the spec sheets", err);
        if (!cancelled) setError(serverMessage(err, "Les fiches techniques n'ont pas pu être chargées."));
      });
    return () => { cancelled = true; };
  }, [attempt]);

  // the model asked for first, then the models with a sheet, then the others
  const ordered = (sheets ?? []).slice().sort((a, b) =>
    (b.model === wanted) - (a.model === wanted) || Boolean(b.fileId) - Boolean(a.fileId));

  const replaceSheet = (saved) =>
    setSheets((current) => current.map((sheet) => (sheet.model === saved.model ? saved : sheet)));

  return (
    <Layout active="specs" wide>
      <PageHeader title="Fiches techniques"
        subtitle="Les caractéristiques de chaque modèle de pompe PHOVA. L'assistant s'en sert pour répondre sur la pompe de la tâche." />
      <div className="mt-6">
        {error && <ErrorBanner message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} />}
        {!error && sheets === null && <ListSkeleton />}
        {sheets && (
          <div className="grid gap-4 lg:grid-cols-2">
            {ordered.map((sheet) => (
              <SpecSheetCard key={sheet.model} sheet={sheet} canEdit={user?.role === "ADMIN"}
                highlighted={sheet.model === wanted} onChanged={replaceSheet} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
