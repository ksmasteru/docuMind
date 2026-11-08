// Step 17 "Contrôle final" (Pumps Maintenance Lead): what to check on the mounted pump, how to run and
// follow its tests, and what to look for in the montage report before deciding. Shown above the report
// on /atelier/:id/controle-final (WorkshopReport.jsx). Guidance only: nothing here is saved.
// Values are the manufacturer's: the guide says what to compare, not the tolerances themselves.
import { ClipboardCheck, Gauge, ShieldAlert, Wrench } from "lucide-react";

const SECTIONS = [
    {
        icon: ShieldAlert,
        title: "Avant tout : la sécurité",
        items: [
            "La pompe et le moteur sont consignés tant que vous travaillez dessus ; déconsignez seulement pour l'essai.",
            "Le protecteur d'accouplement est remis en place avant tout démarrage.",
            "La zone d'essai est dégagée, les raccords et brides sont serrés, le banc ou l'installation est prêt.",
        ],
    },
    {
        icon: Wrench,
        title: "1. Vérifier le montage (pompe à l'arrêt)",
        items: [
            "Les pièces montées sont celles du devis : comparez les références et les quantités avec la liste du devis.",
            "L'arbre tourne librement à la main, sans point dur ni frottement.",
            "Les jeux (roue / bagues d'usure, jeu axial) sont dans les tolérances du constructeur et cohérents avec les mesures du rapport de démontage.",
            "La garniture mécanique ou le presse-étoupe est monté dans le bon sens, propre, sans joint pincé.",
            "Les boulons et écrous sont serrés au couple prescrit, en croix pour les brides et le corps de pompe.",
            "L'alignement pompe / moteur est contrôlé (comparateur ou laser) et dans la tolérance de l'accouplement.",
            "La lubrification est faite : niveau d'huile ou graissage des paliers selon la notice.",
            "Aucun outil, chiffon ou corps étranger ne reste dans la pompe ni dans les tuyauteries.",
        ],
    },
    {
        icon: Gauge,
        title: "2. Assister aux essais",
        items: [
            "La pompe est remplie et amorcée avant le démarrage : elle ne doit jamais tourner à sec.",
            "Le sens de rotation est vérifié par une brève impulsion, avant le démarrage complet.",
            "Démarrage selon la procédure (vanne de refoulement réglée), puis montée progressive au point de fonctionnement.",
            "Relevez débit, pression d'aspiration et de refoulement : ils doivent correspondre à la courbe de la pompe.",
            "Relevez l'intensité du moteur et comparez-la à sa plaque signalétique.",
            "Mesurez les vibrations aux paliers et comparez-les aux limites admises (constructeur ou norme du site).",
            "Suivez la température des paliers jusqu'à ce qu'elle se stabilise ; toute montée continue doit arrêter l'essai.",
            "Écoutez : un bruit de gravier ou de crépitement signale de la cavitation, un bruit métallique un frottement.",
            "Étanchéité : aucune fuite visible sur une garniture mécanique ; sur un presse-étoupe, un léger goutte-à-goutte est normal.",
            "L'essai dure assez longtemps pour que les mesures soient stables, et elles sont notées dans le rapport.",
        ],
    },
    {
        icon: ClipboardCheck,
        title: "3. Relire le rapport de montage, ci-dessous",
        items: [
            "Chaque contrôle est renseigné ; un contrôle « Mauvais » est expliqué dans son commentaire.",
            "Les mesures relevées pendant l'essai figurent dans le rapport et correspondent à ce que vous avez vu.",
            "Les photos des pièces changées et de la pompe assemblée sont présentes et lisibles.",
            "Validez si le montage et les essais sont conformes. Sinon, renvoyez le rapport au technicien en disant précisément quoi reprendre.",
        ],
    },
];

const FinalCheckGuide = () => (
    <section className="space-y-3" aria-labelledby="final-check-title">
        <div>
            <h2 id="final-check-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Contrôle final du montage</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Ce qu'il faut vérifier sur la pompe montée et pendant ses essais, avant de valider le rapport du technicien.
                Les tolérances et valeurs limites sont celles de la notice du constructeur.
            </p>
        </div>
        {SECTIONS.map(({ icon: Icon, title, items }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <Icon className="h-4 w-4 shrink-0 text-[#1A75BC] dark:text-[#5BC6E8]" aria-hidden="true" /> {title}
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
                    {items.map((item) => (
                        <li key={item} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </div>
        ))}
    </section>
);

export default FinalCheckGuide;
