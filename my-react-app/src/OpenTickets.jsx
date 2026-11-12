// « Fiches en cours »: the quality forms and control sheets the user started and saved to finish later,
// like tickets (ReportWizard's ticket mode). Shown on the Formulaires page above the forms; picking one
// resumes it where it stopped. Empty: nothing is drawn.
//
//   list   ← GET    /api/v1/drafts/tickets   (TicketSummary[], last edited first)
//   delete → DELETE /api/v1/drafts/{id}
import { useEffect, useState } from "react";
import { ChevronRight, FolderOpen, Trash2 } from "lucide-react";
import { apiClient } from "./apiClient";

// "2026-11-10T09:12:44Z" → "10/11 à 10:12", the device's time
const savedText = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const two = (n) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} à ${two(d.getHours())}:${two(d.getMinutes())}`;
};

// A sheet left for another one saves itself as it closes (ReportWizard): the list waits for that save,
// or it would show the ticket as it was before, or not at all
let pendingSave = Promise.resolve();
export const rememberSave = (promise) => {
  pendingSave = promise.catch(() => null);
};

// a ticket was saved (ReportWizard): a list on screen loads itself again
export const TICKETS_CHANGED = "tickets-changed";
export const ticketsChanged = () => window.dispatchEvent(new Event(TICKETS_CHANGED));

// onOpen(ticket): resume it (its id, templateId and title). currentId: the ticket open below, marked
export default function OpenTickets({ onOpen, currentId = null }) {
  const [tickets, setTickets] = useState([]);
  const [version, setVersion] = useState(0);

  // loaded again after every save of a ticket, so one saved while the list is on screen shows up
  useEffect(() => {
    const reload = () => setVersion((n) => n + 1);
    window.addEventListener(TICKETS_CHANGED, reload);
    return () => window.removeEventListener(TICKETS_CHANGED, reload);
  }, []);

  useEffect(() => {
    let cancelled = false;
    pendingSave
      .then(() => apiClient.get("/api/v1/drafts/tickets"))
      .then(({ data }) => !cancelled && setTickets(data ?? []))
      .catch((err) => console.log("open tickets not loaded", err));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const remove = async (ticket) => {
    if (!window.confirm(`Supprimer la fiche « ${ticket.title}${ticket.label ? ` — ${ticket.label}` : ""} » ? Ce qui a été saisi sera perdu.`)) return;
    try {
      await apiClient.delete(`/api/v1/drafts/${ticket.id}`);
      setTickets((list) => list.filter((t) => t.id !== ticket.id));
    } catch (err) {
      console.log("ticket not deleted", err);
    }
  };

  if (!tickets.length) return null;
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <FolderOpen className="h-4 w-4 text-[#1A75BC] dark:text-[#5BC6E8]" /> Fiches en cours
        <span className="rounded-full bg-[#1A75BC]/10 px-2 py-0.5 text-xs text-[#1A75BC] dark:bg-[#5BC6E8]/15 dark:text-[#5BC6E8]">{tickets.length}</span>
      </h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Commencées et enregistrées : reprenez-les quand vous avez la suite des informations.</p>
      <ul className="mt-2 space-y-2">
        {tickets.map((t) => (
          <li key={t.id} className={`flex items-stretch rounded-2xl border bg-white shadow-sm dark:bg-slate-800 ${t.id === currentId
            ? "border-[#1A75BC] ring-2 ring-[#1A75BC]/15 dark:border-[#5BC6E8]" : "border-slate-200 dark:border-slate-700"}`}>
            <button type="button" onClick={() => onOpen(t)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-l-2xl px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.title}
                  {t.paperReference && <span className="ml-2 font-mono text-xs font-normal text-slate-500 dark:text-slate-400">{t.paperReference}</span>}
                </span>
                <span className="block truncate text-sm text-slate-600 dark:text-slate-300">{t.label ?? "Sans produit ni date pour l'instant"}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Enregistrée le {savedText(t.updatedAt)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-[#1A75BC] dark:text-[#5BC6E8]">
                {t.id === currentId ? "Ouverte ci-dessous" : <>Reprendre <ChevronRight className="h-4 w-4" /></>}
              </span>
            </button>
            <button type="button" onClick={() => remove(t)} aria-label={`Supprimer la fiche ${t.title}`} title="Supprimer"
              className="flex w-11 shrink-0 items-center justify-center rounded-r-2xl border-l border-slate-100 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-red-950">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
