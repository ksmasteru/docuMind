// A new workshop request, the two ways into the loop (fix_workshop.md):
//   - Sales types a client's request (from the Atelier page); it then completes it on the intervention's page
//   - a manager sends a pump from an alert case: /atelier/nouvelle?equipement=…&panne=…&urgent=1&alerte=12,
//     the form comes pre-filled, the case records the intervention and the page goes back to it
//
//   send → POST /api/v1/interventions   (InterventionCreationDto → { id, number }; the origin comes from the role)
import Layout from "./Layout";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "./apiClient";
import { useAuth } from "./AuthContext";
import { linkIntervention } from "./alertStore";
import { serverMessage } from "./managerUtils";
import { inputClass } from "./workshopUtils";

const WorkshopRequest = () => {
    const [searchParams] = useSearchParams();
    const alertNumber = Number(searchParams.get("alerte")) || null;
    const { user } = useAuth();
    const navigate = useNavigate();
    const sales = user?.role === "SALES";

    const [equipmentId, setEquipmentId] = useState(searchParams.get("equipement") ?? "");
    const [fault, setFault] = useState(searchParams.get("panne") ?? "");
    const [urgent, setUrgent] = useState(searchParams.get("urgent") === "1");
    const [client, setClient] = useState("");
    const [customerOrderNumber, setCustomerOrderNumber] = useState("");
    const [sending, setSending] = useState(false);
    const [errors, setErrors] = useState([]);

    // the server refuses a manager's request without its alert case
    const missingAlert = !sales && !alertNumber;
    const ready = equipmentId.trim() !== "" && fault.trim() !== "" && !missingAlert;
    const back = alertNumber && !sales ? { to: `/alerts/${alertNumber}`, label: `← Alerte #${alertNumber}` } : { to: "/atelier", label: "← Atelier" };

    const submit = async (e) => {
        e.preventDefault();
        setSending(true);
        setErrors([]);
        try {
            const { data } = await apiClient.post("/api/v1/interventions", {
                equipmentId: equipmentId.trim(),
                fault: fault.trim(),
                urgent,
                alertNumber: sales ? null : alertNumber,
                client: client.trim() || null,
                customerOrderNumber: customerOrderNumber.trim() || null,
            });
            if (sales) {
                navigate(`/atelier/${data.id}`, { state: { notice: `Demande ${data.number ?? ""} créée. Complétez-la puis validez-la pour la transmettre.` } });
            }
            else {
                linkIntervention(alertNumber, { id: data.id, number: data.number }, user?.email ?? "Manager");
                navigate(`/alerts/${alertNumber}`, { state: { notice: `${equipmentId.trim()} a été envoyée en atelier (${data.number ?? "nouvelle intervention"}). La demande attend Sales.` } });
            }
        }
        catch (err) {
            console.log("Error while creating the workshop request", err);
            const fieldErrors = err.response?.data?.errors ? Object.values(err.response.data.errors) : [];
            setErrors(fieldErrors.length ? fieldErrors : [serverMessage(err, "La demande n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.")]);
            setSending(false);
        }
    };

    return (
    <Layout active={sales ? "workshop" : "alerts"}>
        <Link to={back.to} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            {back.label}
        </Link>

        <header className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {sales ? "Nouvelle demande client" : "Envoyer en atelier"}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {sales
                    ? "La demande de réparation en atelier reçue du client (téléphone, e-mail)."
                    : "La pompe sera réparée en atelier. La demande part chez Sales, qui la complète avec le client."}
            </p>
        </header>

        {missingAlert && (
            <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                Une pompe s'envoie en atelier depuis son alerte : ouvrez l'alerte et choisissez « Envoyer en atelier ».
            </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <Field label="Équipement" required>
                <input value={equipmentId} onChange={(e) => setEquipmentId(e.target.value.toUpperCase())} disabled={sending}
                    placeholder="ex. PHB3-J-07" autoComplete="off" className={inputClass} />
            </Field>

            <Field label="Panne" required>
                <textarea value={fault} onChange={(e) => setFault(e.target.value)} disabled={sending} rows={3}
                    placeholder="Ce qui ne va pas sur la pompe" className={inputClass} />
            </Field>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} disabled={sending}
                    className="accent-[#1A75BC]" />
                Urgente
            </label>

            {sales && (
                <>
                    <Field label="Client">
                        <input value={client} onChange={(e) => setClient(e.target.value)} disabled={sending}
                            placeholder="ex. OCP Jorf Lasfar" className={inputClass} />
                    </Field>
                    <Field label="N° de commande client">
                        <input value={customerOrderNumber} onChange={(e) => setCustomerOrderNumber(e.target.value)} disabled={sending}
                            autoComplete="off" className={inputClass} />
                    </Field>
                </>
            )}

            {errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {errors.map((message) => <p key={message}>{message}</p>)}
                </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                {!ready && !missingAlert && <p className="text-sm text-slate-500 dark:text-slate-400">L'équipement et la panne sont obligatoires.</p>}
                <button type="submit" disabled={!ready || sending}
                    className="rounded-lg bg-[#1A75BC] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0F2A49] disabled:opacity-50">
                    {sending ? "Envoi…" : sales ? "Créer la demande" : "Envoyer à Sales"}
                </button>
            </div>
        </form>
    </Layout>)
}

export const Field = ({ label, required, children }) => (
    <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {label} {required && <span className="text-red-600 dark:text-red-400">*</span>}
        </p>
        {children}
    </div>
);

export default WorkshopRequest;
