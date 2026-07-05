import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from "./apiClient";

export default function FileItem({ file }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showActions, setShowActions] = useState(false);
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
        `/api/v1/files/id/${encodeURIComponent(file.name)}`,
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

  const handlePreview = (e) => {
    e.stopPropagation();
    const previewUrl = `/api/v1/files/id/${encodeURIComponent(file.name)}?inline=true`;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
    setShowActions(false);
  };

  return (
    <div className="relative inline-block">
      <button
        ref={toggleRef}
        type="button"
        className={`text-sm font-medium text-slate-900 select-none ${
          isDownloading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:underline'
        }`}
        onClick={() => setShowActions((s) => !s)}
      >
        {file.name}
      </button>

      {showActions && (
        <div
          ref={menuRef}
          className="absolute z-10 mt-2 w-36 rounded-md bg-white border shadow-sm right-0"
        >
          <div className="py-1">
            <button
              type="button"
              onClick={handlePreview}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className={`w-full text-left px-3 py-2 text-sm ${
                isDownloading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'
              }`}
            >
              {isDownloading ? 'Downloading…' : 'Download'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}