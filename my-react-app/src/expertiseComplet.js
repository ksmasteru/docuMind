// The "Rapport d'expertise complet": every field of PHOVA's paper expertise report
// (Rapport_ass.pdf), filled in section by section (InspectionForm's SectionWizard).
//
// Its questions are labelled "Section : Champ" ("Roue : Commentaires"). The sections come from
// those labels, and the backend lays the PDF out like the paper report from the same names
// (backend model/ExpertiseReport.java), so the labels below, the template on the server and that
// class must agree. COMPLETE_FORM_ITEMS is what creates the template (POST /api/v1/forms/).
//
// Each part has COMMENTAIRES and RECOMMANDATIONS, dictated. The paper report's tick boxes for
// them (PART_CHOICES) are sent to the transcriber as context, ticked from what was said
// (detectChoices), correctable by hand, and sent in the answer's comment, one per line:
// "☒ Bon état" / "☐ Corrosion" (encodeChoices). The dictated text stays the answer's value.

export const COMPLETE_FORM_TITLE = "Rapport d'expertise complet";

const SEP = " : ";

// "Roue : Commentaires" → { section: "Roue", field: "Commentaires" }
export const splitLabel = (label = "") => {
  const at = label.indexOf(SEP);
  return at < 0
    ? { section: "", field: label.trim() }
    : { section: label.slice(0, at).trim(), field: label.slice(at + SEP.length).trim() };
};

// the sheet's own fields (emplacement, date du contrôle) under the paper report's names
export const COMPLETE_META = {
  equipmentLabel: "Repère géographique",
  dateLabel: "Date d'expertise",
  placeholder: "ex. 23AP08",
};

export const INFO_SECTION = "Informations générales";
const PHOTOS = "Photos";
const COMMENTS = "Commentaires";
const RECOMMENDATIONS = "Recommandations";
const PARTS_LIST = "Liste des pièces";

const goodOrDegraded = {
  [COMMENTS]: ["Bon état", "Dégradé"],
  [RECOMMENDATIONS]: ["Nettoyage et réutilisation", "À remplacer"],
};

const faceComments = [
  "Bon état",
  "Présence de rayures et/ou piqûres",
  "Présence de rayures et/ou piqûres profondes",
  "Face fissurée",
  "Face cassée",
  "Usure au niveau du logement du pion",
];

// the paper report's tick boxes, part by part
export const PART_CHOICES = {
  "Pompe à la réception": {
    [COMMENTS]: ["Produit colmaté", "Rotation libre de l'arbre", "Arbre bloqué en rotation", "Chaise de palier dégradée"],
  },
  "Corps de la pompe": {
    [COMMENTS]: [
      "Bon état",
      "Bride d'aspiration et/ou refoulement dégradée",
      "Présence de produit colmaté ou corps étranger",
      "Trous et/ou taraudage de fixation dégradés",
      "Traces de frottement et/ou usure",
      "Fissures",
      "Corrosion",
      "Érosion",
      "Surface de portée de joint dégradée",
    ],
    [RECOMMENDATIONS]: ["Nettoyage et réutilisation", "Réparation et réutilisation", "Installation d'un nouveau corps de pompe"],
  },
  Roue: {
    [COMMENTS]: [
      "Bon état",
      "Pompe reçue sans roue",
      "Usure au niveau de l'œil de la roue (légère)",
      "Alésage ou taraudage de la roue endommagé",
      "Ogive et/ou vis d'ogive dégradée",
      "Traces de frottement et/ou usure",
      "Fissures",
      "Corrosion",
      "Érosion",
      "Déformation des aubes et/ou des flasques",
    ],
    [RECOMMENDATIONS]: ["Nettoyage et réutilisation", "Réparation et réutilisation", "Installation d'une nouvelle roue"],
  },
  Fond: {
    [COMMENTS]: [
      "Bon état",
      "Usure au niveau de la portée du joint torique GM",
      "Usure de la surface de contact",
      "Trous/taraudage de fixation",
      "Traces de frottement et/ou usure",
      "Fissures",
      "Corrosion",
      "Érosion",
    ],
    [RECOMMENDATIONS]: ["Nettoyage et réutilisation", "Réparation et réutilisation", "Remplacement"],
  },
  Palier: {
    [COMMENTS]: [
      "Bon état",
      "Contamination par l'eau",
      "Diamètre d'alésage DE et/ou NDE hors tolérances",
      "Décoloration due à un échauffement",
      "Trous/taraudage de fixation dégradés",
      "Usure (emboîtement couvercles…)",
    ],
    [RECOMMENDATIONS]: ["Nettoyage et réutilisation", "Réparation et réutilisation du palier", "Remplacement du palier"],
  },
  Roulements: {
    [COMMENTS]: ["Bon état", "Contamination par l'eau/acide…", "Grippage (mauvaise lubrification…)", "Usure normale", "Cassures"],
    [RECOMMENDATIONS]: ["Changement systématique"],
  },
  Arbre: {
    [COMMENTS]: [
      "Bon état",
      "Partie de fixation avec la roue usée (cône, filetage, taraudage)",
      "Rainure de clavette DE et/ou NDE dégradée",
      "Traces de frottement",
      "Décoloration due à un échauffement",
      "Usure",
      "Hors tolérance d'ajustement des roulements",
      "Hors tolérance de concentricité",
    ],
    [RECOMMENDATIONS]: ["Nettoyage et réutilisation", "Réparation et réutilisation", "Remplacement"],
  },
  "Flasques côté PPE": goodOrDegraded,
  "Flasques côté CDE": goodOrDegraded,
  Déflecteur: goodOrDegraded,
  "Face rotative côté process": {
    [COMMENTS]: [...faceComments, "Manque à la réception"],
    [RECOMMENDATIONS]: ["Nettoyage, rodage et réutilisation", "Remplacement"],
  },
  "Face stationnaire côté process": {
    [COMMENTS]: [...faceComments, "Support grain dégradé (usure, corrosion, érosion…)", "Manque à la réception"],
    [RECOMMENDATIONS]: ["Nettoyage, rodage et réutilisation", "Remplacement"],
  },
  Chemise: {
    [COMMENTS]: ["Bon état", "Usure au niveau des portées des joints", "Traces de frottements", "Usure (corrosion, érosion…)"],
    [RECOMMENDATIONS]: ["Nettoyage, polissage et réutilisation", "Réparation et réutilisation", "Remplacement"],
  },
  "Couvercle et boîte à GM": {
    [COMMENTS]: ["Bon état", "Usure au niveau de portée de joint", "Usure (corrosion, érosion…)"],
    [RECOMMENDATIONS]: ["Nettoyage, polissage et réutilisation", "Réparation et réutilisation", "Remplacement"],
  },
};

const INSPECTION_PARTS = [
  "Corps de la pompe", "Roue", "Fond", "Palier", "Roulements", "Arbre",
  "Flasques côté PPE", "Flasques côté CDE", "Déflecteur",
];
const SEAL_PARTS = ["Face rotative côté process", "Face stationnaire côté process", "Chemise", "Couvercle et boîte à GM"];
// The measurement cards are laid out like the paper report rather than as a list of fields:
// each geometric check under its drawing, the shaft / bearing values as one table under the
// shaft drawing (InspectionForm's GeometricChecks / DimensionTable). Drawings: public/expertise.
export const GEOMETRIC_SECTION = "Contrôles géométriques";
export const DIMENSIONS_SECTION = "Contrôles dimensionnels arbre/palier";
export const GEOMETRIC_CHECKS = [
  { name: "Concentricité de l'arbre", drawing: "/expertise/concentricite-arbre.png" },
  { name: "Déplacement axial", drawing: "/expertise/deplacement-axial.png" },
  { name: "Déplacement radial", drawing: "/expertise/deplacement-radial.png" },
  { name: "Perpendicularité", drawing: "/expertise/perpendicularite.png" },
  { name: "Concentricité de la boîte à garniture", drawing: "/expertise/concentricite-boite.png" },
];
const GEOMETRIC = GEOMETRIC_CHECKS.map((c) => c.name);
// J and X: pump clearances (coupe-pompe.png); J5–J8: bearing / shaft clearances; C1–C5: shaft runout
export const DIMENSION_KEYS = ["J", "X", "J5", "J6", "J7", "J8", "C1", "C2", "C3", "C4", "C5"];
export const DIMENSION_DRAWINGS = { shaft: "/expertise/arbre-palier.png", pump: "/expertise/coupe-pompe.png" };
const MOUNT_CHECKS = [
  "Contrôle général de la propreté et conformité visuelle des pièces à remonter",
  "Contrôle du centrage de l'arbre",
  "Contrôle de la concentricité de la boîte à garniture",
  "Contrôle des jeux des déplacements d'arbre (radial et axial)",
  "Contrôle de la perpendicularité de l'arbre à la boîte à garniture",
  "Test d'étanchéité de la garniture avant montage",
  "Contrôle du serrage de la visserie de la pompe",
  "Ajustage du jeu hydraulique de la pompe",
  "Test d'étanchéité de la garniture après montage",
  "Test d'étanchéité de la pompe",
  "Protection des orifices de la garniture mécanique",
  "Protection de l'aspiration et du refoulement de la pompe",
];

const item = (section, field, answerType = "TEXT") => ({
  labelFr: `${section}${SEP}${field}`,
  labelAr: null,
  critical: false,
  answerType,
});
const part = (section) => [
  item(section, PHOTOS, "IMAGE"),
  item(section, COMMENTS),
  ...(PART_CHOICES[section]?.[RECOMMENDATIONS] ? [item(section, RECOMMENDATIONS)] : []),
];

// the template's questions, in the paper report's order (the body of POST /api/v1/forms/)
export const COMPLETE_FORM_ITEMS = [
  ...[
    "Client", "Adresse client", "Entité", "N° de commande client", "N° d'opération",
    "Matricule équipement", "Type", "Fabricant", "Fluide pompé", "Raison de la demande d'expertise",
    "Date de réception", "Auteur rapport démontage", "Date de montage", "Auteur rapport montage",
  ].map((f) => item(INFO_SECTION, f)),
  ...part("Pompe à la réception"),
  ...INSPECTION_PARTS.flatMap(part),
  ...GEOMETRIC.flatMap((m) => [item(GEOMETRIC_SECTION, `${m} au démontage`), item(GEOMETRIC_SECTION, `${m} au remontage`)]),
  ...DIMENSION_KEYS.map((k) => item(DIMENSIONS_SECTION, `${k} au démontage`)),
  ...DIMENSION_KEYS.map((k) => item(DIMENSIONS_SECTION, `${k} au montage`)),
  ...["Fabricant", "Type", "N° de plan"].map((f) => item("Garniture mécanique", f)),
  item("Garniture mécanique", PHOTOS, "IMAGE"),
  ...SEAL_PARTS.flatMap(part),
  item("Pièces", PARTS_LIST),
  item("Pièces changées", PHOTOS, "IMAGE"),
  item("Pièces changées", COMMENTS),
  item("Commentaires supplémentaires", COMMENTS),
  item("Commentaires supplémentaires", PHOTOS, "IMAGE"),
  item("Pompe assemblée", PHOTOS, "IMAGE"),
  item("Montage pompe", "Sales order (OT)"),
  ...MOUNT_CHECKS.map((c, i) => item("Montage pompe", `${i + 1}. ${c}`, "BON_MAUVAIS")),
];

export const COMPLETE_FORM_INSTRUCTIONS =
  "Rapport d'expertise complet, section par section. Prenez les photos de chaque pièce, puis dictez " +
  "les commentaires et les recommandations : les cases du rapport se cochent d'après ce que vous dites.";

// ─── Suggestions ───────────────────────────────────────────────────────────
// Fields with a known set of values get them as tick boxes under the field: ticking one replaces
// what the field holds with it, unticking empties it; anything else can still be typed or
// dictated. Gathered from public sources: the fluids of OCP's Jorf Lasfar and Safi sites, pump makers
// serving phosphate plants (and PHOVA's own manuals: Sulzer AHLSTAR, Flowserve HDX), mechanical
// seal makers, API 682 seal flush plans, and the usual causes of centrifugal pump failure.
const SUGGESTIONS = {
  [`${INFO_SECTION}${SEP}Client`]: ["OCP S.A"],
  [`${INFO_SECTION}${SEP}Adresse client`]: ["Complexe industriel Jorf Lasfar, El Jadida", "Complexe industriel Safi"],
  [`${INFO_SECTION}${SEP}Fabricant`]: ["PHOVA", "Flowserve", "Sulzer", "KSB", "ITT Goulds", "Weir Minerals (Warman)", "Düchting"],
  // PHOVA's own pumps first
  [`${INFO_SECTION}${SEP}Type`]: [
    "PHOVA OTC", "PHOVA OTW", "PHOVA PHB2", "PHOVA PHB3", "PHOVA PHH",
    "Sulzer AHLSTAR", "Flowserve HDX", "Flowserve ME", "Goulds AF", "Goulds IC",
  ],
  [`${INFO_SECTION}${SEP}Fluide pompé`]: [
    "Eau de mer", "Acide phosphorique", "Acide sulfurique", "Pulpe de phosphate", "Bouillie de gypse", "Eau traitée",
  ],
  [`${INFO_SECTION}${SEP}Raison de la demande d'expertise`]: [
    "Fuite à la garniture", "Vibrations", "Bruit anormal", "Échauffement des roulements",
    "Cavitation", "Baisse de débit", "Arbre bloqué", "Révision préventive",
  ],
  [`Garniture mécanique${SEP}Fabricant`]: ["John Crane", "EagleBurgmann", "Flowserve", "AESSEAL", "Sulzer"],
  [`Garniture mécanique${SEP}Type`]: ["Simple", "Double", "Cartouche simple", "Cartouche double", "À soufflet"],
  [`Garniture mécanique${SEP}N° de plan`]: [
    "Plan 11", "Plan 13", "Plan 21", "Plan 23", "Plan 32", "Plan 52", "Plan 53A", "Plan 53B", "Plan 53C", "Plan 54", "Plan 62", "Plan 65",
  ],
};

export const suggestionsFor = (label) => SUGGESTIONS[label?.trim()] ?? null;

// the suggestion a field's value is, if it is one (ignoring case and spaces)
export const pickedSuggestion = (value, options) =>
  options.find((o) => o.toLowerCase() === (value ?? "").trim().toLowerCase()) ?? null;

// ─── Measurements and dates ────────────────────────────────────────────────

// a measured value, marked by the technician as outside its tolerance: red in the PDF, as on the
// paper report. Sent as the answer's comment.
export const OUT_OF_TOLERANCE = "Hors tolérance";

export const isMeasure = (label) => {
  const { section } = splitLabel(label);
  return section === GEOMETRIC_SECTION || section === DIMENSIONS_SECTION;
};

// "0,08", "+0,14", "0.07 mm", "0 ,10", "N/A": a number (with its sign and unit) or not applicable
export const isMeasureValue = (value) => /^\s*(n\s*\/?\s*a|[+\-±]?\s*\d+(\s*[.,]\s*\d+)?\s*(mm)?)\s*$/i.test(value ?? "");

// the report's dates (réception, montage): picked from a calendar, kept as "22/02/2024"
export const isDateField = (label) => {
  const { section, field } = splitLabel(label);
  return section === INFO_SECTION && field.startsWith("Date");
};

// ─── Per question ──────────────────────────────────────────────────────────

// the tick boxes of a Commentaires / Recommandations question, or null
export const choicesFor = (label) => {
  const { section, field } = splitLabel(label);
  return PART_CHOICES[section]?.[field] ?? null;
};

// fields that take a paragraph (and a mic) rather than a short value
export const isLongField = (label) => {
  const { field } = splitLabel(label);
  return field === COMMENTS || field === RECOMMENDATIONS || field === PARTS_LIST || field === "Raison de la demande d'expertise";
};

export const PARTS_HINT =
  "Une ligne par pièce : quantité ; description ; code ; recommandation ; décision client ; remarque.";

// ─── Pièces ────────────────────────────────────────────────────────────────
// Step "Pièces" is a table of parts and quantities (InspectionForm's PartsTable): the parts a
// teardown usually replaces, from the paper report and the inspected parts above, and any other
// the technician adds. The answer stays the paper report's table, one line per part,
// "quantité ; description ; code ; recommandation ; décision client ; remarque", which the PDF
// prints as is (backend ExpertiseReport.partLines).
export const PARTS_SECTION = "Pièces";
export const SPARE_PARTS = [
  "Roulements", "Garniture mécanique", "Jeu de joints", "Chemise", "Arbre", "Roue", "Palier",
  "Couvercle et boîte à GM", "Déflecteur", "Bague d'usure", "Écrou auto-frein", "Clavette",
  "Flasque côté PPE", "Flasque côté CDE", "Fond", "Corps de pompe",
];
export const PART_RECOMMENDATIONS = ["Changer", "Réparer", "Nettoyer et réutiliser"];
// who provides the new part: the client from its stock, or PHOVA as the parts maker
export const PART_DECISIONS = ["Changer par OCP", "Changer par PHOVA", "Récupéré", "Réparé"];

const PART_FIELDS = ["quantity", "name", "code", "recommendation", "decision", "remark"];

// the stored lines → [{ quantity, name, code, recommendation, decision, remark }]; a line
// without ";" (typed or dictated freely) is a part name
export const parsePartLines = (value) =>
  (value ?? "")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const cells = line.includes(";") ? line.split(";").map((c) => c.trim()) : ["", line.trim()];
      // anything after the fifth ";" belongs to the remark
      const remark = cells.slice(5).join("; ");
      return Object.fromEntries(PART_FIELDS.map((f, i) => [f, f === "remark" ? remark : cells[i] ?? ""]));
    });

// back to lines; a part counts once it has a quantity
export const partLinesOf = (parts) =>
  parts
    .filter((p) => Number(p.quantity) > 0)
    .map((p) => PART_FIELDS.map((f) => String(p[f] ?? "").replace(/[;\n]/g, ",").trim()).join(" ; "))
    .join("\n");

// What the transcriber hears before the technician speaks: the part and its boxes, so the
// paper report's own words come out spelled right and match the boxes.
export const completeContext = (label, vocabulary) => {
  const { section, field } = splitLabel(label);
  const options = PART_CHOICES[section]?.[field] ?? suggestionsFor(label);
  if (options) return `Rapport d'expertise pompe. ${section}. ${field} possibles : ${options.join(". ")}. ${field} :`;
  if (isMeasure(label))
    return (
      `Rapport d'expertise pompe. ${section}. Valeurs en millimètres, par exemple 0,08. +0,14. 0,00. N/A. ` +
      `${field} :`
    );
  if (field === PARTS_LIST)
    return (
      "Rapport d'expertise pompe. Pièces : 2 roulements 6313, changer. Couvercle et boîte à garniture, changer, récupéré. " +
      "Chemise. Arbre. Écrou auto-frein M33. Palier. Déflecteur. Jeu de joints. Garniture mécanique, changer par OCP. Liste des pièces :"
    );
  return `${vocabulary} Rapport d'expertise pompe. ${section}. ${field} :`;
};

// A dictated measure, as the field keeps it: Whisper ends a sentence with a full stop ("0,08.")
// and may say "virgule" or put a dot for the decimal point.
export const dictatedMeasure = (text) =>
  text
    .trim()
    .replace(/[.!?;:]+$/, "")
    .replace(/\s*virgule\s*/gi, ",")
    .replace(/(\d)\.(\d)/g, "$1,$2")
    .replace(/\bmillim[eè]tres?\b/gi, "mm")
    .trim();

// ─── Tick boxes ────────────────────────────────────────────────────────────

// a word's spoken form whatever its agreement: "fissures" / "fissure", "dégradée" / "dégradé"
const stem = (word) => (word.length > 4 ? word.replace(/(es|s|e)$/, "") : word);

// lower case, no accents, words only, agreement dropped: "Dégradées" → "degrad", "et/ou" → "et ou"
const normalize = (text) =>
  (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map(stem)
    .join(" ");

// words that say nothing about which box it is
const FILLER = new Set(["de", "des", "du", "la", "le", "les", "et", "ou", "au", "aux", "a", "d", "l", "en", "par", "niveau", "une", "un"]);
// "pas de corrosion", "aucune fissure", "sans usure": the box stays empty
const NEGATIONS = new Set(["pas", "aucun", "aucune", "sans", "ni", "non"]);

const negated = (words, at) => words.slice(Math.max(0, at - 3), at).some((w) => NEGATIONS.has(w));

// the same word, or one sharing its first five letters with it ("grippés" / "grippage")
const sameWord = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

// Which boxes a text ticks. A box is ticked when its words are said in order ("bon état",
// "corrosion"), or when one phrase (between commas or full stops) holds at least three quarters
// of them ("bride d'aspiration dégradée", "grippés" for "Grippage"), unless a
// "pas / aucun / sans" comes just before. Between two boxes where one holds the other's words
// ("…piqûres" / "…piqûres profondes"), only the one said in full is ticked.
export const detectChoices = (text, choices) => {
  const sentences = (text ?? "").split(/[.,;!?\n]+/).map(normalize).filter(Boolean);
  const keysOf = (choice) => normalize(choice).split(" ").filter((w) => !FILLER.has(w));
  // the share of the box's words said, 0 when not ticked
  const coverage = (choice) => {
    const phrase = normalize(choice);
    const key = keysOf(choice);
    let best = 0;
    for (const sentence of sentences) {
      const words = sentence.split(" ");
      const at = ` ${sentence} `.indexOf(` ${phrase} `);
      if (at >= 0) {
        if (!negated(words, sentence.slice(0, at).split(" ").filter(Boolean).length)) return 1;
        continue;
      }
      const found = key.filter((k) => words.some((w) => sameWord(w, k)));
      const share = found.length / key.length;
      const first = words.findIndex((w) => found.some((k) => sameWord(w, k)));
      if (share >= 0.75 && share > best && !negated(words, first)) best = share;
    }
    return best;
  };
  const hits = choices.map((choice) => ({ choice, keys: keysOf(choice), share: coverage(choice) })).filter((h) => h.share > 0);
  return hits
    .filter(
      (h) =>
        !hits.some(
          (o) =>
            o !== h &&
            o.share === 1 &&
            // a shorter box inside a longer one said in full, or a longer one only partly said
            // around a shorter one said in full
            ((o.keys.length > h.keys.length && h.keys.every((k) => o.keys.includes(k))) ||
              (h.share < 1 && o.keys.length < h.keys.length && o.keys.every((k) => h.keys.includes(k))))
        )
    )
    .map((h) => h.choice);
};

// the answer's comment: every box, ticked or not, as the PDF prints them
export const encodeChoices = (choices, checked) =>
  choices.map((c) => `${checked.includes(c) ? "☒" : "☐"} ${c}`).join("\n");
