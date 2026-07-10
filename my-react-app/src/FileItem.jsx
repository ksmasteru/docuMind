import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from "./apiClient";

export default function FileItem({ file }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("unsupported");
  const [previewSrc, setPreviewSrc] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const menuRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    if (!showActions) return;

    const handleClickOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        toggleRef.current &&
        !toggleRef.current.contains(event.target)
      ) {
        setShowActions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showActions]);

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const response = await apiClient.get(
        `/api/v1/files/id/${encodeURIComponent(file.id)}`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setShowActions(false);
    } catch (error) {
      console.error('File download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };


const handlePreview = async (e) => {
  e.stopPropagation();
  setShowActions(false);
  setIsPreviewOpen(true);
  setIsPreviewLoading(true);
  setPreviewText("");
  setPreviewSrc("");
  setPreviewType("unsupported");

  try {
    const response = await apiClient.get(
      `/api/v1/files/id/${encodeURIComponent(file.id)}?inline=true`,
      { responseType: "blob" }
    );

    const contentType = response.headers["content-type"] || "application/octet-stream";
    const blob = new Blob([response.data], { type: contentType });

    if (contentType.includes("pdf")) {
      setPreviewType("pdf");
      setPreviewSrc(URL.createObjectURL(blob));
    } else if (
      contentType.startsWith("text/") ||
      contentType.includes("md")
    ) {
      const text = await blob.text();
      setPreviewType("text");
      setPreviewText(text);
    } else {
      setPreviewType("unsupported");
    }
  } catch (error) {
    console.error("Preview failed:", error);
    setPreviewType("unsupported");
    setPreviewText("Unable to load preview for this file.");
  } finally {
    setIsPreviewLoading(false);
  }
};

  return (
    <div className="relative inline-block">
      <button
        ref={toggleRef}
        type="button"
        className={`text-sm font-medium text-slate-900 select-none dark:text-slate-100 ${
          isDownloading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:underline'
        }`}
        onClick={() => setShowActions((s) => !s)}
      >
        {file.name}
      </button>

      {showActions && (
        <div
          ref={menuRef}
          className="absolute z-10 mt-2 w-36 rounded-2xl border border-slate-200 bg-white shadow-sm right-0 dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="py-1">
            <button
              type="button"
              onClick={handlePreview}
              className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className={`w-full text-left px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ${
                isDownloading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {isDownloading ? 'Downloading…' : 'Download'}
            </button>
          </div>
        </div>
      )}
    
{isPreviewOpen && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    onClick={() => setIsPreviewOpen(false)}
  >
    <div
      className="relative h-[90vh] w-[90vw] max-w-6xl rounded-2xl bg-white p-2 shadow-xl dark:bg-slate-800"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setIsPreviewOpen(false)}
        className="absolute right-2 top-2 z-10 rounded-full bg-slate-800 px-2 py-1 text-sm text-white dark:bg-slate-700"
      >
        ✕
      </button>

      <div className="h-full overflow-auto rounded-xl bg-slate-50 p-2 dark:bg-slate-900">
        {isPreviewLoading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-600 dark:text-slate-400">
            Loading preview...
          </div>
        )}

        {!isPreviewLoading && previewType === "image" && (
          <img src={previewSrc} alt={file.name} className="mx-auto h-full w-full object-contain" />
        )}

        {!isPreviewLoading && previewType === "pdf" && (
          <iframe src={previewSrc} title={file.name} className="h-full w-full rounded" />
        )}

        {!isPreviewLoading && previewType === "text" && (
          <pre className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">
            {previewText}
          </pre>
        )}

        {!isPreviewLoading && previewType === "unsupported" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              This file type cannot be previewed inline.
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-2xl bg-slate-800 px-3 py-2 text-sm text-white dark:bg-slate-700"
            >
              Download file
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
    )}
    </div>
  );
}