// The ticks and chips of the pump models a document serves (plan_pump_manuals.md part B), on « Importer » and
// « Documents ». The labels and calls they use are in pumpDocuments.js.
import { KIND_CHIP, KIND_LABEL } from "./pumpDocuments";

// the models a document is ticked for: « OTW », « OTW · comparable », « OTW · fiche technique »
export function ModelChips({ links, empty = null }) {
  if (!links?.length) return empty;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {links.map(({ model, kind }) => (
        <span key={`${model}-${kind}`} title={`${model} : ${KIND_LABEL[kind] ?? kind}`}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${KIND_CHIP[kind] ?? KIND_CHIP.OWN}`}>
          {model}
          {kind !== "OWN" && <span className="ml-1 font-normal opacity-80">· {kind === "SPEC" ? "fiche" : "comparable"}</span>}
        </span>
      ))}
    </span>
  );
}

// The ticks: which models a document serves, and what it is to them. No model ticked: general documentation
// (standards, safety, procedures), used for every pump.
export function ModelPicker({ models, selected, onToggle, kind, onKindChange, disabled = false, idPrefix = "model" }) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {models.map((model) => {
          const checked = selected.includes(model);
          return (
            <label key={model} htmlFor={`${idPrefix}-${model}`}
              className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                checked
                  ? "border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              }`}>
              <input id={`${idPrefix}-${model}`} type="checkbox" checked={checked} onChange={() => onToggle(model)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              {model}
            </label>
          );
        })}
      </div>
      {selected.length > 0 ? (
        <div className="space-y-1.5 text-sm">
          <p className="text-slate-600 dark:text-slate-300">Ce document est :</p>
          {[
            ["OWN", "un document PHOVA sur ces modèles (manuel, procédure…)"],
            ["COMPARABLE", "le manuel d'une pompe similaire, pris comme référence : ses valeurs ne sont pas celles de ces modèles, l'assistant le signalera"],
          ].map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-start gap-2 text-slate-700 dark:text-slate-200">
              <input type="radio" name={`${idPrefix}-kind`} value={value} checked={kind === value}
                onChange={() => onKindChange(value)} className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Aucun modèle coché : documentation générale (normes, sécurité, procédures…), utilisée pour toutes les pompes.
        </p>
      )}
    </fieldset>
  );
}
