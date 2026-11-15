// The pieces of a check report (levée de doute) the technician fills on his phone, shared by the check
// of an alert (CheckReportForm.jsx) and the fault report (FieldAlerts.jsx → FieldReportForm):
//
//   PhotoPicker      photos taken or picked, sent at once (/api/v1/images), shown while they upload
//   SectionsEditor   free sections: a title, photos, a comment ("+ Ajouter une section")
//   NextStepEditor   for a confirmed alert: "Je peux m'en charger" (message, estimate, parts) or why not
//   ChoiceCards      big tappable choices (verdicts, results, causes)
//   CheckPdfButton   the report as a PDF, with its verification QR code (checkReport.js downloadCheckPdf)
//
// A photo is { key, id, local }: id once the server has it (null while it uploads), local the
// browser's preview (absent for a photo from an earlier round, shown through AuthPhoto instead).
import { useState } from "react";
import { FileDown, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiClient } from "./apiClient";
import { AuthPhoto } from "./AuthPhoto";
import { CANNOT_HANDLE_REASON } from "./alertContent";
import { serverMessage } from "./managerUtils";
import { downloadCheckPdf, inputClass, labelClass, newKey } from "./checkReport";
import { shrinkPhoto } from "./photoUtils";
import { MicroLabel } from "./dashboard/primitives";
import { TONE } from "./dashboard/tokens";


export const Box = ({ title, action, children, className }) => (
    <section className={cn("rounded-md border border-border bg-card p-4", className)}>
        {(title || action) && (
            <div className="mb-3 flex items-center justify-between gap-2">
                {title && <MicroLabel as="h2">{title}</MicroLabel>}
                {action}
            </div>
        )}
        {children}
    </section>
);

export const Tag = ({ tone, children, className }) => (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-data text-[10px] font-semibold uppercase tracking-[0.12em]", TONE[tone].soft, TONE[tone].text, className)}>
        {children}
    </span>
);


export function PhotoPicker({ pumpId, photos, setPhotos, label = "Ajouter" }) {
    const [error, setError] = useState(null);
    const add = async (event) => {
        const files = [...event.target.files];
        event.target.value = "";
        setError(null);
        for (const file of files) {
            const local = URL.createObjectURL(file);
            const key = newKey();
            setPhotos((list) => [...list, { key, local, id: null }]);
            try {
                const form = new FormData();
                form.append("image", await shrinkPhoto(file));
                if (pumpId) form.append("equipementId", pumpId);
                form.append("fix", "FAULT");
                const { data } = await apiClient.post("/api/v1/images", form);
                setPhotos((list) => list.map((p) => (p.key === key ? { ...p, id: data.imageId } : p)));
            }
            catch (err) {
                console.log("photo refused", err);
                setPhotos((list) => list.filter((p) => p.key !== key));
                setError(serverMessage(err, "Une photo n'a pas pu être envoyée (JPEG, PNG ou WebP)."));
            }
        }
    };
    return (
        <div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((photo) => (
                    <div key={photo.key} className="relative">
                        {photo.local
                            ? <img src={photo.local} alt="" className={cn("aspect-square w-full rounded-sm border border-border object-cover", !photo.id && "opacity-50")} />
                            : <AuthPhoto imageId={photo.id} alt="" className="aspect-square w-full" />}
                        {!photo.id && <span className="absolute inset-x-0 bottom-1 text-center font-data text-[10px] text-foreground">envoi…</span>}
                        <button type="button" onClick={() => setPhotos((list) => list.filter((p) => p.key !== photo.key))} aria-label="Retirer la photo"
                            className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <X className="size-3.5" aria-hidden="true" />
                        </button>
                    </div>
                ))}
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-input text-xs text-muted-foreground transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                    <ImagePlus className="size-5" aria-hidden="true" /> {label}
                    <input type="file" accept="image/*" capture="environment" multiple onChange={add} className="sr-only" />
                </label>
            </div>
            {error && <p role="alert" className="mt-1 text-xs text-crit">{error}</p>}
        </div>
    );
}

// options: [{ value, label, hint?, tone?, icon? }]; columns: Tailwind grid classes
export function ChoiceCards({ name, options, value, onChange, columns = "grid-cols-1 sm:grid-cols-3", compact = false }) {
    return (
        <div className={cn("grid gap-2", columns)} role="radiogroup" aria-label={name}>
            {options.map((option) => {
                const selected = value === option.value;
                const tone = option.tone ?? "neutral";
                const Icon = option.icon;
                return (
                    <button key={option.value} type="button" role="radio" aria-checked={selected} onClick={() => onChange(option.value)}
                        className={cn("flex items-start gap-2 rounded-sm border text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                            compact ? "min-h-10 items-center justify-center px-2 py-2 text-center" : "min-h-12 px-3 py-2.5",
                            selected ? cn("border-current", TONE[tone].soft, TONE[tone].text) : "border-input text-foreground hover:bg-accent")}>
                        {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                        <span className="min-w-0">
                            <span className="block text-sm font-medium">{option.label}</span>
                            {option.hint && <span className={cn("block text-xs", selected ? "opacity-90" : "text-muted-foreground")}>{option.hint}</span>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// sections: [{ key, title, comment, photos }]
export function SectionsEditor({ sections, setSections, pumpId, placeholder = "Ex. : Plaque signalétique, Fuite côté accouplement" }) {
    const update = (key, patch) => setSections((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    const setPhotosOf = (key) => (next) => setSections((list) => list.map((s) => (s.key === key
        ? { ...s, photos: typeof next === "function" ? next(s.photos) : next } : s)));
    return (
        <div className="space-y-3">
            {sections.map((section, index) => (
                <div key={section.key} className="rounded-sm border border-border p-3">
                    <div className="flex items-center gap-2">
                        <input value={section.title} onChange={(e) => update(section.key, { title: e.target.value })} maxLength={255}
                            aria-label={`Titre de la section ${index + 1}`} placeholder={placeholder} className={inputClass} />
                        <button type="button" onClick={() => setSections((list) => list.filter((s) => s.key !== section.key))}
                            aria-label={`Retirer la section ${index + 1}`}
                            className="rounded-sm p-2 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                            <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="mt-2"><PhotoPicker pumpId={pumpId} photos={section.photos} setPhotos={setPhotosOf(section.key)} /></div>
                    <textarea value={section.comment} onChange={(e) => update(section.key, { comment: e.target.value })} rows={2}
                        aria-label={`Commentaire de la section ${index + 1}`} placeholder="Ce que montrent ces photos, ce que vous avez constaté…"
                        className={cn(inputClass, "mt-2")} />
                </div>
            ))}
            <button type="button" onClick={() => setSections((list) => [...list, { key: newKey(), title: "", comment: "", photos: [] }])}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-input px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                <Plus className="size-4" aria-hidden="true" /> Ajouter une section
            </button>
        </div>
    );
}

// next: { canHandle, handleMessage, estimatedHours, partsNeeded, cannotHandleReason, cannotHandleComment }
export function NextStepEditor({ next, setNext }) {
    const set = (patch) => setNext((n) => ({ ...n, ...patch }));
    return (
        <div className="space-y-3">
            <ChoiceCards name="Pouvez-vous vous en charger ?" columns="grid-cols-1 sm:grid-cols-2"
                value={next.canHandle === null ? null : next.canHandle ? "yes" : "no"}
                onChange={(v) => set({ canHandle: v === "yes" })}
                options={[
                    { value: "yes", label: "Je peux m'en charger", hint: "Votre manager reçoit votre demande. S'il accepte, la tâche arrive dans vos Tâches.", tone: "ok" },
                    { value: "no", label: "Je ne peux pas", hint: "Dites pourquoi : votre manager choisira la suite.", tone: "warn" },
                ]} />
            {next.canHandle === true && (
                <div className="space-y-3">
                    <label className={labelClass}>
                        Message pour votre manager <span className="font-normal text-muted-foreground">(facultatif)</span>
                        <textarea value={next.handleMessage} onChange={(e) => set({ handleMessage: e.target.value })} rows={2}
                            placeholder="Ex. : je peux le faire demain matin." className={cn(inputClass, "mt-1.5")} />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                        <label className={labelClass}>
                            Durée estimée <span className="font-normal text-muted-foreground">(h)</span>
                            <input type="number" inputMode="decimal" min="0.25" max="500" step="0.25" value={next.estimatedHours}
                                onChange={(e) => set({ estimatedHours: e.target.value })} placeholder="Ex. : 3" className={cn(inputClass, "mt-1.5")} />
                        </label>
                        <label className={labelClass}>
                            Pièces et outillage nécessaires <span className="font-normal text-muted-foreground">(facultatif)</span>
                            <input value={next.partsNeeded} onChange={(e) => set({ partsNeeded: e.target.value })} maxLength={2000}
                                placeholder="Ex. : joint 45×62, graisse SKF LGHP2" className={cn(inputClass, "mt-1.5")} />
                        </label>
                    </div>
                </div>
            )}
            {next.canHandle === false && (
                <div className="space-y-3">
                    <fieldset>
                        <legend className={labelClass}>Pourquoi ?</legend>
                        <div className="mt-1.5">
                            <ChoiceCards name="Pourquoi ne pouvez-vous pas vous en charger ?" columns="grid-cols-1 sm:grid-cols-2"
                                value={next.cannotHandleReason} onChange={(v) => set({ cannotHandleReason: v })}
                                options={Object.entries(CANNOT_HANDLE_REASON).map(([value, label]) => ({ value, label }))} />
                        </div>
                    </fieldset>
                    <label className={labelClass}>
                        Précisez {next.cannotHandleReason === "OTHER" ? "(obligatoire)" : <span className="font-normal text-muted-foreground">(facultatif)</span>}
                        <textarea value={next.cannotHandleComment} onChange={(e) => set({ cannotHandleComment: e.target.value })} rows={2}
                            placeholder="Ex. : il faut un électricien pour le moteur." className={cn(inputClass, "mt-1.5")} />
                    </label>
                </div>
            )}
        </div>
    );
}

// round: the one to print, the latest when absent
export function CheckPdfButton({ taskId, round, label = "PDF", className }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const download = async () => {
        setBusy(true);
        setError(false);
        try {
            await downloadCheckPdf(taskId, round);
        }
        catch (err) {
            console.log("Error while downloading the check report", err);
            setError(true);
        }
        finally {
            setBusy(false);
        }
    };
    return (
        <span className={cn("inline-flex flex-col items-end", className)}>
            <Button type="button" variant="outline" size="sm" onClick={download} disabled={busy}
                aria-label={label === "PDF" ? "Télécharger le rapport en PDF" : undefined}>
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />} {label}
            </Button>
            {error && <span role="alert" className="mt-1 text-xs text-crit">Le PDF n'a pas pu être créé. Réessayez.</span>}
        </span>
    );
}
