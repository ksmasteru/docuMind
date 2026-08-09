// AnalysisPanel.jsx
// Renders the stats/charts DataAnalysisService already computed for a given
// file: stat tiles + the pre-rendered histogram/bar/correlation PNGs from
// analysis-service + a column profile table. Ingestion runs async on the
// backend, so this polls GET /{fileId}/analysis until the row exists.
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";

const POLL_INTERVAL_MS = 2500;

function StatTile({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

// Charts are matplotlib PNGs rendered server-side with a white background,
// so the card stays light regardless of app theme instead of looking broken
// in dark mode.
function ChartCard({ chart }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <img src={`data:image/png;base64,${chart.image}`} alt={chart.title} className="w-full" />
      <p className="border-t border-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
        {chart.title}
      </p>
    </div>
  );
}

export default function AnalysisPanel({ fileId, fileName }) {
  const [analysis, setAnalysis] = useState(null);
  const [isPending, setIsPending] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // Keyed by fileId in the parent (see DataVisualisor.jsx), so this whole
  // component remounts — and its state resets — whenever the selected file
  // changes, instead of needing to reset state imperatively in here.
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    let timer;

    async function poll(n) {
      try {
        const { data } = await apiClient.get(`/api/v1/files/${fileId}/analysis`);
        if (cancelled) return;
        setAnalysis(data);
        setIsPending(false);
      } catch {
        if (cancelled) return;
        // The upload response returns before ingestion (which calls
        // analysis-service) finishes, so a failure here usually just means
        // "not ready yet" rather than a real error — keep polling.
        setAttempt(n);
        timer = setTimeout(() => poll(n + 1), POLL_INTERVAL_MS);
      }
    }

    poll(1);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fileId]);

  if (!fileId) return null;

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500">
        <p className="text-sm">{attempt < 3 ? "Analyzing" : "Still working on"} {fileName ?? "your file"}…</p>
        <p className="mt-1 text-xs">This can take a few seconds for larger files.</p>
      </div>
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(analysis.analysisJson);
  } catch {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-red-500 dark:text-red-400">Couldn't read the analysis for this file.</p>
      </div>
    );
  }

  const columnProfiles = parsed.column_profiles ?? [];
  const numericCount = columnProfiles.filter((c) => c.stats).length;
  const categoricalCount = columnProfiles.length - numericCount;
  const missingTotal = columnProfiles.reduce((sum, c) => sum + (c.null_count ?? 0), 0);

  return (
    <div className="h-full w-full overflow-y-auto p-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fileName}</h2>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Rows" value={parsed.shape?.rows ?? "—"} />
        <StatTile label="Columns" value={parsed.shape?.cols ?? "—"} />
        <StatTile label="Numeric cols" value={numericCount} />
        <StatTile label="Categorical cols" value={categoricalCount} />
      </div>

      {missingTotal > 0 && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {missingTotal} missing value{missingTotal === 1 ? "" : "s"} across the dataset.
        </p>
      )}

      {parsed.charts?.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {parsed.charts.map((chart, i) => (
            <ChartCard key={i} chart={chart} />
          ))}
        </div>
      )}

      {columnProfiles.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Column</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Missing</th>
                <th className="px-3 py-2 font-medium">Unique</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {columnProfiles.map((col) => (
                <tr key={col.name}>
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{col.name}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{col.dtype}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{col.null_pct}%</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{col.unique_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
