import React, { useState } from 'react';
import { apiClient } from "./apiClient";


// 1. Define the component and accept the 'file' prop
export default function FileItem({ file }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    
    try {
      const response = await apiClient.get(`/api/v1/files/id/${file.name}`, {
        responseType: 'blob' 
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('File download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <span 
      className={`text-sm font-medium text-slate-900 select-none ${
        isDownloading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:underline'
      }`} 
      onClick={handleDownload}
    >
      {file.name}
    </span>
  );
}
