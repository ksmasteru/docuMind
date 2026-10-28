// The manager's technician list, the mobile app's Tâche tab.
//
//   list ← GET /api/v1/users/technicians   ({ technicianInfo: [{ name, email, worksite }] })
//
// Open a card to see the email and assign a task. The assign page is keyed by email,
// which is how the backend identifies users; the name is only for its header.
import Layout from "./Layout";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "./apiClient";
import { EmptyState, ErrorBanner, ExpandableCard, GroupHeading, ListSkeleton, Notice, PageHeader, SectionLabel } from "./managerUi";
import { serverMessage } from "./managerUtils";

const Technicians = () => {
    const [technicians, setTechnicians] = useState(null); // null = still loading
    const [attempt, setAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const [openId, setOpenId] = useState(null);
    const navigate = useNavigate();
    const notice = useLocation().state?.notice;
    // ?equipement=PHB3-J-07&alerte=12: the order was started from a pump (and an alert case),
    // the assign form gets them too
    const [searchParams] = useSearchParams();
    const equipment = searchParams.get("equipement");
    const alertNumber = searchParams.get("alerte");

    // attempt: bumped by Retry to run this again
    useEffect(() => {
        const loadTechnicians = async () => {
            try {
                const { data } = await apiClient.get("/api/v1/users/technicians");
                setLoadError(null);
                setTechnicians(data.technicianInfo ?? []);
            }
            catch (err) {
                console.log("Error while fetching technicians", err);
                setLoadError(serverMessage(err, "La liste n'a pas pu être chargée. Vérifiez votre connexion et réessayez."));
                setTechnicians([]);
            }
        };
        loadTechnicians();
    }, [attempt]);

    const onRetry = () => {
        setTechnicians(null);
        setAttempt((n) => n + 1);
    };

    const toggle = (id) => setOpenId((current) => current === id ? null : id);

    const assignTask = (technician) => {
        const params = new URLSearchParams();
        if (technician.name) params.set("name", technician.name);
        if (equipment) params.set("equipement", equipment);
        if (alertNumber) params.set("alerte", alertNumber);
        const query = params.toString() ? `?${params}` : "";
        navigate(`/assign/${encodeURIComponent(technician.email)}${query}`);
    };

    const loading = technicians === null;

    return (
    <Layout active="technicians">
        <PageHeader title="Techniciens" subtitle="Choisissez un technicien pour lui assigner une tâche." />

        {notice && <Notice>{notice}</Notice>}

        <div className="mt-6">
            {loading && <ListSkeleton />}

            {!loading && loadError && <ErrorBanner message={loadError} onRetry={onRetry} />}

            {!loading && !loadError && technicians.length === 0 && (
                <EmptyState icon="👷" title="Aucun technicien disponible pour le moment"
                    hint="Les techniciens disponibles apparaissent ici." />
            )}

            {!loading && technicians.length > 0 && (
            <>
            <GroupHeading>Techniciens disponibles · {technicians.length}</GroupHeading>
            <ul className="space-y-2">
                {technicians.map((technician) => (
                <ExpandableCard
                    key={technician.email}
                    isOpen={openId === technician.email}
                    onToggle={() => toggle(technician.email)}
                    summary={<>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{technician.name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Site : {technician.worksite || "—"}
                        </p>
                    </>}
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <SectionLabel>E-mail</SectionLabel>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{technician.email}</p>
                        </div>
                        <button type="button" onClick={() => assignTask(technician)}
                            className="rounded-lg bg-[#1A75BC] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#0F2A49]">
                            + Assigner une tâche
                        </button>
                    </div>
                </ExpandableCard>
                ))}
            </ul>
            </>
            )}
        </div>
    </Layout>)
}

export default Technicians;
