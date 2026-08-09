// DataVisualisor.jsx
// Three-pane workspace: CSV/Excel upload on the left, chart canvas in the
// middle (populated later), and the same RAG chat from /ask on the right so
// you can ask questions about whatever's been uploaded.
import { useCallback, useRef, useState } from "react";
import { TopBar } from "./Layout";
import { apiClient } from "./apiClient";
import AskChat from "./AskChat";

const ACCEPTED_TYPES = ".csv,.xls,.xlsx";

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-slate-400 dark:text-slate-500">
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ChartPlaceholderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-6 4 3 5-8" />
    </svg>
  );
}

function StatusBadge({ status }) {
  if (status === "uploading") {
    return <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">Uploading…</span>;
  }
  if (status === "success") {
    return <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">Uploaded</span>;
  }
  return <span className="shrink-0 text-xs text-red-600 dark:text-red-400">Failed</span>;
}

// Left panel — drop/select CSV or Excel files; each one uploads immediately
// (title defaults to the filename, same as UploadPage does when left blank).
function UploadPanel() {
  const [files, setFiles] = useState([]); // [{ name, status: "uploading"|"success"|"error" }]
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  async function uploadFile(selected) {
    const entry = { name: selected.name, status: "uploading" };
    setFiles((prev) => [entry, ...prev]);

    const formData = new FormData();
    formData.append("file", selected);
    formData.append("title", selected.name.replace(/\.[^/.]+$/, ""));

    try {
      // No explicit Content-Type — see UploadPage.jsx for why (the browser
      // needs to set its own multipart boundary).
      await apiClient.post("/api/v1/files/upload", formData);
      setFiles((prev) => prev.map((f) => (f === entry ? { ...f, status: "success" } : f)));
    } catch {
      setFiles((prev) => prev.map((f) => (f === entry ? { ...f, status: "error" } : f)));
    }
  }

  function pickFiles(fileList) {
    Array.from(fileList ?? []).forEach(uploadFile);
  }

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
    pickFiles(event.dataTransfer.files);
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Data files</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Upload a CSV or Excel file to analyze.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-3 py-8 text-center transition ${
          isDragging
            ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950"
            : "border-slate-300 hover:border-slate-400 dark:border-slate-600 dark:hover:border-slate-500"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            pickFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <UploadIcon />
        <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
          Drop CSV/Excel here, or click to choose
        </p>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">.csv, .xls, .xlsx</p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="truncate text-xs text-slate-700 dark:text-slate-300">{f.name}</span>
              <StatusBadge status={f.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DataVisualisor() {
  return (
    <div className="flex h-screen flex-col bg-white dark:bg-slate-900">
      <TopBar active="visualize" />

      <div className="flex flex-1 min-h-0">
        {/* Left — upload (20%) */}
        <aside className="w-1/5 shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-700">
          <UploadPanel />
        </aside>

        {/* Middle — chart canvas, wired up later (60%) */}
        <main className="flex w-3/5 flex-1 flex-col items-center justify-center overflow-y-auto border-r border-slate-200 p-6 dark:border-slate-700">
          <div className="text-center text-slate-400 dark:text-slate-500">
            <ChartPlaceholderIcon />
            <p className="mt-3 text-sm">Visualizations will show up here.</p>
          </div>
        </main>

        {/* Right — Ask chat (20%) */}
        <aside className="w-1/5 shrink-0 overflow-hidden">
          <AskChat compact />
        </aside>
      </div>
    </div>
  );
}
