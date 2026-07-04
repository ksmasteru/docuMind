// Accepts the exact shape your backend's FileResponse record produces:
// { files: [{ name, size, userId }], filesCount: number }

export default function FileList({ data }) {
  if (!data) return null;

  const { files, filesCount } = data;

  if (filesCount === 0 || files.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500">
        No files uploaded yet.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
        {filesCount} {filesCount === 1 ? "file" : "files"}
      </p>

      <ul className="space-y-2">
        {files.map((file) => (
          <li
            key={file.name}
            className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            {/* Left: icon + name */}
            <div className="flex min-w-0 items-center gap-3">
              <FileIcon name={file.name} />
              <span
                title={file.name}
                className="truncate text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                {file.name}
              </span>
            </div>

            {/* Right: size + uploader */}
            <div className="ml-4 flex shrink-0 items-center gap-4">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {formatBytes(file.size)}
              </span>
              <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:block">
                {file.userId}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Picks an emoji based on file extension — no external icon dependency needed.
function FileIcon({ name }) {
  const ext = name?.split(".").pop()?.toLowerCase();
  const icon =
    ext === "pdf" ? "📄"
    : ext === "md"  ? "📝"
    : ext === "txt" ? "📃"
    : "📁";

  return (
    <span className="shrink-0 text-base" role="img" aria-label={ext ?? "file"}>
      {icon}
    </span>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  return kb < 1024
    ? `${kb.toFixed(0)} KB`
    : `${(kb / 1024).toFixed(1)} MB`;
}
