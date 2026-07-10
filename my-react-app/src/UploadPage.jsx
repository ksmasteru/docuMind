import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "./apiClient";
import Layout from "./Layout";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | uploading | success | error
  const [errorMessage, setErrorMessage] = useState(null);
  const fileInputRef = useRef(null);

  function pickFile(selected) {
    if (!selected) return;
    setFile(selected);
    if (!title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ""));
    }
  }

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
    pickFile(event.dataTransfer.files?.[0]);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setErrorMessage(null);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);

    try {
      // Deliberately NOT setting a Content-Type header here. FormData needs
      // a multipart boundary in the Content-Type (e.g.
      // "multipart/form-data; boundary=----abc123"), and the browser only
      // generates that automatically if you let it set the header itself.
      // Setting "multipart/form-data" manually overrides that and ships a
      // boundary-less header, which the server can't parse correctly.
      await apiClient.post("/api/v1/files/upload", formData, {
        onUploadProgress: (event) => {
          if (event.total) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      setStatus("success");
      setFile(null);
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setStatus("error");
      if (err.response?.status === 403) {
        setErrorMessage(
          "Forbidden — your session may lack permission for this action, or the token wasn't accepted. Check the console/network tab."
        );
      } else if (err.response?.status === 413) {
        setErrorMessage("That file is too large.");
      } else {
        setErrorMessage("Upload failed. Check the file and try again.");
      }
    }
  }

  return (
    <Layout active="upload">
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Upload a document</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          PDFs and text documents are indexed for search after upload.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${
              isDragging
                ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950"
                : "border-slate-300 hover:border-slate-400 dark:border-slate-600 dark:hover:border-slate-500"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {file ? (
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{file.name}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Drop a file here, or click to choose one
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">PDF, TXT, or MD — up to 25MB</p>
              </>
            )}
          </div>

          <div className="mt-4">
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Title
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-900"
            />
          </div>

          {/* No tags field — DocumentController's /upload only accepts
              file + title right now. Add it here once the backend's
              FileEntity/uploadFile actually supports tags. */}

          {status === "uploading" && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className="h-full bg-indigo-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{progress}%</p>
            </div>
          )}

          {status === "success" && (
            <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              Uploaded. It'll show up in search shortly.
            </p>
          )}

          {status === "error" && (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={!file || status === "uploading"}
            className="mt-5 w-full rounded-2xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:disabled:bg-slate-700"
          >
            {status === "uploading" ? "Uploading…" : "Upload document"}
          </button>
        </form>
      </main>
    </div>
    </Layout>
  );
}