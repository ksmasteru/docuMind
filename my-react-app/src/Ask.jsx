// The « Assistant » page: the chat, with the pump model it answers about (plan_pump_manuals.md part C).
// The model chosen here is sent with each question: the assistant then searches that model's documents, puts its
// spec sheet first, and labels the values taken from another pump's manual. « Non précisée »: the whole library,
// and the answer says the pump isn't known. The choice is kept on the device.
import { useState } from "react";
import Layout from "./Layout";
import AskChat from "./AskChat";
import { usePumpModels } from "./pumpDocuments";

const STORAGE_KEY = "ask.pumpModel";

export default function Ask() {
  const { models } = usePumpModels();
  const [pumpModel, setPumpModel] = useState(() => localStorage.getItem(STORAGE_KEY) || "");

  const choose = (model) => {
    setPumpModel(model);
    if (model) localStorage.setItem(STORAGE_KEY, model);
    else localStorage.removeItem(STORAGE_KEY);
  };

  // a model kept from before that no longer exists (HDX until 2026-11-24) counts as none
  const current = models.length && pumpModel && !models.includes(pumpModel) ? "" : pumpModel;

  return (
    <Layout active="ask">
      <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
        <div className="border-b border-slate-100 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Modèle de pompe">
            <span className="mr-1 text-xs text-slate-500 dark:text-slate-400">Pompe :</span>
            {["", ...models].map((model) => (
              <button key={model || "none"} type="button" role="radio" aria-checked={current === model}
                onClick={() => choose(model)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${current === model
                  ? "border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-200"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"}`}>
                {model || "Non précisée"}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <AskChat pumpModel={current || undefined}
            emptyHint={current
              ? `Réponses à partir de la fiche technique et des manuels du modèle ${current}.`
              : "Posez une question sur une pompe ou sur son entretien. Choisissez la pompe ci-dessus pour des réponses sur ce modèle."} />
        </div>
      </div>
    </Layout>
  );
}
