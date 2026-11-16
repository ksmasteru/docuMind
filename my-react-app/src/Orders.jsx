// Work orders the signed-in manager assigned, still in progress on the technicians' side, and the ones
// a technician declined, which wait for him (« À réaffecter »). The mobile app's Ordres tab.
//
//   list        ← GET  /api/v1/task/assigned        ({ tasks: [...], tasksCount }, each with technicianEmail)
//   declined    ← GET  /api/v1/task/declined        (the same shape: his tasks their technician declined)
//   technicians ← GET  /api/v1/users/technicians    ({ technicianInfo: [{ name, email, worksite }] }: names, and
//                                                     who a task can go to)
//   reassign    → POST /api/v1/task/{id}/reassign   { technicianEmail }: a task nobody started (assigned, declined)
//   cancel      → POST /api/v1/task/{id}/cancel     { comment }: a task not sent yet, or declined
//
// Open a card to read its instructions and act on it. A levée de doute is followed from its alert:
// its card links there instead.
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "./apiClient";
import { EmptyState, ErrorBanner, ExpandableCard, GroupHeading, ListSkeleton, Notice, PageHeader, PriorityBadge, SectionLabel } from "./managerUi";
import { ORDER_STATUS, buttonBase, byPriority, formatDay, humanize, serverMessage } from "./managerUtils";

const fieldClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const quietButton = `${buttonBase} border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700`;

// what the manager can still do about a task: give it to someone else while nobody started it, or cancel it
function OrderActions({ order, technicians, onDone }) {
    const [mode, setMode] = useState(null); // "reassign" | "cancel" | null
    const [to, setTo] = useState("");
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const canReassign = order.status === "ASSIGNED" || order.status === "DECLINED";
    const others = technicians.filter((t) => t.email !== order.technicianEmail || order.status === "DECLINED");
    const open = (what) => { setMode(what); setError(null); };

    const send = async (request, notice) => {
        setSending(true);
        setError(null);
        try {
            await request();
            onDone(notice);
        }
        catch (err) {
            console.log("Error while changing the order", err);
            setError(serverMessage(err, "La modification n'a pas pu être enregistrée. Réessayez."));
            setSending(false);
        }
    };
    const reassign = () => {
        const name = technicians.find((t) => t.email === to)?.name ?? to;
        send(() => apiClient.post(`/api/v1/task/${order.id}/reassign`, { technicianEmail: to }), `« ${order.title} » est maintenant chez ${name}.`);
    };
    const cancel = () => send(() => apiClient.post(`/api/v1/task/${order.id}/cancel`, { comment: comment.trim() }), `« ${order.title} » est annulée.`);

    if (order.taskType === "VERIFICATION")
        return order.alertNumber ? (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                Une levée de doute se suit depuis son alerte.{" "}
                <Link to={`/alerts/${order.alertNumber}`} className="font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">Voir l'alerte #{order.alertNumber} →</Link>
            </p>
        ) : null;

    return (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
            {mode === null && (
                <div className="flex flex-wrap justify-end gap-2">
                    {canReassign && <button type="button" onClick={() => open("reassign")} className={quietButton}>Confier à un autre technicien</button>}
                    <button type="button" onClick={() => open("cancel")} className={`${buttonBase} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950`}>Annuler la tâche</button>
                </div>
            )}

            {mode === "reassign" && (
                <div className="space-y-2">
                    <label className="block text-sm text-slate-600 dark:text-slate-300">
                        Nouveau technicien
                        <select value={to} onChange={(e) => setTo(e.target.value)} disabled={sending} className={fieldClass}>
                            <option value="">Choisir…</option>
                            {others.map((t) => <option key={t.email} value={t.email}>{t.name}{t.worksite ? ` · ${t.worksite}` : ""}</option>)}
                        </select>
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">La tâche lui arrive « Assignée » : il l'accepte ou la refuse à son tour.</p>
                    <div className="flex justify-end gap-2">
                        <button type="button" disabled={sending} onClick={() => setMode(null)} className={`${buttonBase} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700`}>Retour</button>
                        <button type="button" disabled={sending || !to} onClick={reassign} className={`${buttonBase} bg-[#1A75BC] text-white hover:bg-[#0F2A49]`}>{sending ? "Envoi…" : "Confier la tâche"}</button>
                    </div>
                </div>
            )}

            {mode === "cancel" && (
                <div className="space-y-2">
                    <label className="block text-sm text-slate-600 dark:text-slate-300">
                        Pourquoi ? <span className="text-red-600 dark:text-red-400">*</span>
                        <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={sending} rows={2}
                            placeholder="Ex. : doublon, pompe déjà réparée. Le technicien le verra." className={fieldClass} />
                    </label>
                    <div className="flex justify-end gap-2">
                        <button type="button" disabled={sending} onClick={() => setMode(null)} className={`${buttonBase} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700`}>Retour</button>
                        <button type="button" disabled={sending || !comment.trim()} onClick={cancel} className={`${buttonBase} bg-red-600 text-white hover:bg-red-700`}>{sending ? "Annulation…" : "Confirmer l'annulation"}</button>
                    </div>
                </div>
            )}

            {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        </div>
    );
}

const Orders = () => {
    const [orders, setOrders] = useState(null); // null = still loading
    const [declined, setDeclined] = useState([]);
    const [technicians, setTechnicians] = useState([]);
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [notice, setNotice] = useState(null);

    // attempt: bumped by Retry, and after a change, to run this again
    useEffect(() => {
        const loadOrders = async () => {
            try {
                const [active, refused, people] = await Promise.all([
                    apiClient.get("/api/v1/task/assigned"),
                    apiClient.get("/api/v1/task/declined").catch(() => null),            // a server not updated yet has none
                    apiClient.get("/api/v1/users/technicians").catch(() => null),        // names only: the cards fall back to e-mails
                ]);
                setLoadError(null);
                setOrders([...(active.data.tasks ?? [])].sort(byPriority));
                setDeclined([...(refused?.data?.tasks ?? [])].sort(byPriority));
                setTechnicians([...(people?.data?.technicianInfo ?? [])].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")));
            }
            catch (err) {
                console.log("Error while fetching assigned tasks", err);
                setLoadError(serverMessage(err, "La liste n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
                setOrders([]);
            }
        };
        loadOrders();
    }, [attempt]);

    const onRetry = () => {
        setOrders(null);
        setAttempt((n) => n + 1);
    };
    const changed = (message) => {
        setNotice(message);
        setOpenId(null);
        setAttempt((n) => n + 1);
    };

    const toggle = (id) => setOpenId((current) => current === id ? null : id);
    const nameOf = (email) => technicians.find((t) => t.email === email)?.name ?? email ?? "—";

    const loading = orders === null;

    const card = (order) => {
        const status = ORDER_STATUS[order.status];
        const refused = order.status === "DECLINED";
        return (
        <ExpandableCard
            key={order.id}
            isOpen={openId === order.id}
            onToggle={() => toggle(order.id)}
            tone={refused ? "border-l-4 border-l-orange-500" : ""}
            summary={<>
                <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{order.title}</p>
                    <PriorityBadge priority={order.priority} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                    <span>Technicien : {nameOf(order.technicianEmail)}</span>
                    <span>Équipement : {order.equipmentId}</span>
                    <span>Échéance : {order.dueDate ? formatDay(order.dueDate) : "Sans échéance"}</span>
                    <span className={status?.style}>{status?.label ?? humanize(order.status)}</span>
                </div>
                {/* why it is blocked, declined, or what was asked to redo */}
                {order.statusComment && <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">« {order.statusComment} »</p>}
            </>}
        >
            <SectionLabel>Instructions</SectionLabel>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">
                {order.instructions || "Aucune instruction."}
            </p>
            <OrderActions order={order} technicians={technicians} onDone={changed} />
        </ExpandableCard>);
    };

    return (
    <Layout active="orders">
        <PageHeader title="Ordres de travail" subtitle="Les tâches que vous avez assignées." />

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-6">
            {loading && <ListSkeleton />}

            {!loading && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!loading && !loadError && orders.length === 0 && declined.length === 0 && (
                <EmptyState icon="📋" title="Aucun ordre en cours"
                    hint="Assignez une tâche depuis la page Techniciens." />
            )}

            {!loading && declined.length > 0 && (
            <div className="mb-6">
                <GroupHeading>À réaffecter · {declined.length}</GroupHeading>
                <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Refusées par leur technicien : confiez-les à quelqu'un d'autre, ou annulez-les.</p>
                <ul className="space-y-2">{declined.map(card)}</ul>
            </div>
            )}

            {!loading && orders.length > 0 && (
            <>
            <GroupHeading>Ordres actifs · {orders.length}</GroupHeading>
            <ul className="space-y-2">{orders.map(card)}</ul>
            </>
            )}
        </div>
    </Layout>)
}

export default Orders;
