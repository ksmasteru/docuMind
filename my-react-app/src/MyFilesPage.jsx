import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import FileList from "../components/FileList";

export default function MyFilesPage() {
  const { user } = useAuth();

  // data matches FileResponse: { files: FileInfo[], filesCount: number }
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | success | error

  useEffect(() => {
    if (!user?.email) return;

    // DocumentController's /filter/{keyword} searches by name/keyword.
    // There's no "files by current user" endpoint yet — this uses the
    // user's email as the keyword, which only works if your DocumentService
    // stores/indexes the userId in a searchable field and the filter logic
    // matches on it. If you want a proper "my files" list, the cleanest
    // backend addition would be GET /api/v1/files/user/{userId} that filters
    // by the userId field directly.
    
    apiClient
      .get(`/v1/files/filter/${encodeURIComponent(user.email)}`)
      .then(({ data: responseData }) => {
        setData(responseData);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [user?.email]);

  return (
    <Layout active="myfiles">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            My files
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Documents you've uploaded to this workspace.
          </p>
        </div>

        {/* Refresh button — handy right after an upload */}
        {status === "success" && (
          <button
            onClick={() => {
              setStatus("loading");
              apiClient
                .get(`/v1/files/filter/${encodeURIComponent(user.email)}`)
                .then(({ data: d }) => { setData(d); setStatus("success"); })
                .catch(() => setStatus("error"));
            }}
            className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Refresh
          </button>
        )}
      </div>

      {status === "loading" && (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-12 animate-pulse rounded-md bg-slate-100 dark:bg-slate-700" />
          ))}
        </ul>
      )}

      {status === "error" && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          Couldn't load your files. Try refreshing.
        </p>
      )}

      {status === "success" && <FileList data={data} />}
    </Layout>
  );
}
