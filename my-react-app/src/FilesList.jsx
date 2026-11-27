import { useState } from 'react';
import FileItem  from './FileItem.jsx'; // 3. Import the new component
import { useAuth } from "./AuthContext";
import { apiClient } from "./apiClient";
import { serverMessage } from "./managerUtils";
import { kindOf, tickedModels, usePumpModels } from "./pumpDocuments";
import { ModelChips, ModelPicker } from "./PumpDocumentControls";

    /*
     {status === "success" && data.filesCount > 0 && (
        <ul className="space-y-2">
            {<FilesList filesList={data.files}/>}
        </ul>
        )}
    */

// Each file with the pump models it is ticked for (plan_pump_manuals.md part B). The admin changes them here
// (PUT /api/admin/files/{id}/models): a document uploaded before the ticks existed, or ticked wrong.
// A spec sheet's link to its model is changed on « Fiches techniques », not here.
const FilesList = ({filesList}) =>
{
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";
    // the links saved here since the search, by file id
    const [savedLinks, setSavedLinks] = useState({});
    const [editing, setEditing] = useState(null); // file id

    return (
        <>
         {filesList.map((file, index) => {
            const links = savedLinks[file.id] ?? file.models ?? [];
            return (
              <li key={file.id ?? `${file.name ?? "user"}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <FileItem file={file}></FileItem>
                      <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {file.size + "kb"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {file.userId}
                      </span>
                      </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <ModelChips links={links}
                      empty={<span className="text-xs text-slate-400 dark:text-slate-500">Documentation générale</span>} />
                    {isAdmin && file.id && editing !== file.id && (
                      <button type="button" onClick={() => setEditing(file.id)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950">
                        Modèles
                      </button>
                    )}
                  </div>
                  {editing === file.id && (
                    <ModelLinksEditor file={file} links={links}
                      onSaved={(saved) => { setSavedLinks((current) => ({ ...current, [file.id]: saved })); setEditing(null); }}
                      onCancel={() => setEditing(null)} />
                  )}
              </li>
            );
          })}
        </>
    );
}

function ModelLinksEditor({ file, links, onSaved, onCancel }) {
    const { models, error: modelsError } = usePumpModels();
    const [selected, setSelected] = useState(tickedModels(links));
    const [kind, setKind] = useState(kindOf(links));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const sheets = links.filter((l) => l.kind === "SPEC");

    const toggle = (model) =>
        setSelected((current) => current.includes(model) ? current.filter((m) => m !== model) : [...current, model]);

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const { data } = await apiClient.put(`/api/admin/files/${encodeURIComponent(file.id)}/models`, { models: selected, kind });
            onSaved(data.models ?? []);
        }
        catch (err) {
            console.log("Error while saving the models of a document", err);
            setError(serverMessage(err, "Les modèles n'ont pas pu être enregistrés."));
        }
        finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Modèles de pompe concernés par « {file.name} »</p>
            {sheets.length > 0 && (
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                    C'est la fiche technique de {sheets.map((s) => s.model).join(", ")} : elle se change sur la page « Fiches techniques ».
                </p>
            )}
            {modelsError ? <p className="text-sm text-red-700 dark:text-red-300">{modelsError}</p> : (
                <ModelPicker models={models} selected={selected} onToggle={toggle} kind={kind} onKindChange={setKind}
                    disabled={saving} idPrefix={`edit-${file.id}`} />
            )}
            {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={onCancel} disabled={saving}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
                    Annuler
                </button>
                <button type="button" onClick={save} disabled={saving}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
            </div>
        </div>
    );
}

export default FilesList;
