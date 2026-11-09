# Report UI — the expertise report, redesigned

Source: `PHOVA_Instruction_Developpeur_UX_MVP_Expertise.pdf` (PHOVA / EXPERTISE POMPES / UX V1.0, 5 November 2026,
12 pages), written for the developer improving the MVP. This file is what its pages show — tables, the screen
mockup, the rules — read from the page images, with the French labels kept as they'll appear in the app.
It concerns the technician's reports (démontage and montage), not the workshop loop (`fix_workshop.md`).

The document separates **business requirements** from its own **UX recommendations** ("Recommandation UX"): the
latter are suggestions, and nothing added for ergonomics may change the expertise logic without validation.

## Priority decisions (page 1)

- One main section per page: never the whole report as one long form.
- **Informations générales** is one complete page, every field visible on it, grouped readably.
- **Inspection**: one page per part; the mechanical seal's sub-components get their own pages too.
- Several photos per part, **a title per photo**, a grid that adapts to how many there are.
- Findings, anomalies and recommendations specific to each part, plus a way to add a case that isn't listed.
- Measures and summary tables: structured entry, **several readings with an automatic average**, the client's
  decisions, and a final checklist.

## The 11 sections (page 2)

The report is a wizard: the user moves from one section to the next without losing anything.

| Étape | Écran / rubrique | Contenu attendu |
|---|---|---|
| 01 | Informations générales | One page with every identification field |
| 02 | Pompe réceptionnée | Photos and overall state of the pump |
| 03 | Inspection des pièces | Sub-pages: corps, roue, palier, roulements, arbre, flasques, déflecteur, autres |
| 04 | Contrôles géométriques | Sub-pages per type of measure and per phase: démontage / remontage |
| 05 | Contrôles dimensionnels | Arbre et palier: views, clearances (jeux), concentricité |
| 06 | Garniture mécanique | Sub-pages: face stationnaire, face rotative, chemise, couvercle |
| 07 | Synthèse des pièces | Quantities, codes, recommendations, client decisions, remarks |
| 08 | Pièces changées / réparées | Supporting photos, titles, comments |
| 09 | Commentaires supplémentaires | Extra observations and images |
| 10 | Pompe assemblée | Photos and comments after reassembly |
| 11 | Contrôle de montage | Conformity checklist, statuses, remarks |

Navigation:
- A progress bar and the active section; any section already filled in can be reopened.
- **Précédent / Suivant** buttons; data is kept when changing page.
- Save a draft and resume where it stopped. *(UX recommendation)*
- An added part automatically creates a new inspection sub-page.
- Rule: navigation goes section by section, but **Informations générales is not split question by question** —
  it is shown whole, on one page.

Sections 01–07 are the démontage report's, 08–11 the montage report's (today's
"Rapport d'expertise (démontage)" / "(montage)" forms), Informations générales being in both.

## The inspection page template (page 3)

The same page template for every part and every seal sub-component. The mockup:

```
┌──────────────────────────────────────────────────────────────────────┐
│ INSPECTION / CORPS DE POMPE                       Étape 3 > pièce 1/8 │  ← dark header bar
├──────────────────────────────────────────────────────────────────────┤
│ ┌ Photos du composant ─────────────────────────────────────────────┐ │
│ │ Ajouter plusieurs photos | titre de chaque photo | affichage      │ │
│ │ dynamique                                                         │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│ │    Vue 1     │  │    Vue 2     │  │  + Ajouter   │   ← photo tiles │
│ └──────────────┘  └──────────────┘  └──────────────┘                 │
│ Constats / anomalies (multi-sélection)                               │
│ ☐ Bon état      ☐ Corrosion      ☐ Fissures      ☐ + Autre           │
│ Commentaire [texte ou audio]                                         │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ Recommandation                                                       │
│ ( ) Nettoyage + réutilisation  ( ) Réparation + réutilisation        │
│ ( ) Remplacement                                                     │
│ < Précédent                                           [Enregistrer >]│
└──────────────────────────────────────────────────────────────────────┘
```

(In the PDF's drawing the recommendation radios overflow below the footer bar; the intended order is the one above:
photos, findings, comment, recommendation, footer.)

| Zone | Comportement demandé |
|---|---|
| A. En-tête | The part's name, where it sits in the journey ("Étape 3 > pièce 1/8"), clear navigation |
| B. Galerie images | Add 1 or N photos; reorder / delete / replace; a title per photo; the grid adapts to the number of photos |
| C. Constats | Multi-select checkboxes, specific to the part; « Autre » when the list isn't enough |
| D. Commentaires | Free text, and an audio comment / voice dictation |
| E. Recommandations | The technical decision for this part; a free option / justification can be added |
| F. Bas de page | Enregistrer, Précédent, Suivant; show what's filled in / missing **without forcing everything at once** |

UX recommendation: no repeated fields, no giant lists. « Bon état » should exclude a contradictory anomaly,
with a discreet help message.

## Pages 1 and 2 of the report (page 4)

**Écran 1 — Informations générales (one page)**, the fields in visual groups, all on the same page:

| Groupe | Champs | Saisie conseillée |
|---|---|---|
| Client / dossier | Client; adresse; entité; n° de commande; n° d'opération; repère géographique | Text, searchable lists |
| Identification pompe | Matricule; type; fabricant; fluide pompé | Text, lists if available |
| Motif / expertise | Raison de la demande d'expertise; date de réception; date d'expertise; auteur du rapport de démontage | Text / voice; date picker |
| Remontage | Date du montage; auteur du rapport de montage | Date picker; text |

- Written or audio input help where useful; a date picker for every date.
- Collapsible groups only if everything stays reachable on the same page. *(UX recommendation)*

**Écran 2 — Pompe réceptionnée / état global**
- A gallery of one or more images; columns and thumbnail size adapt automatically.
- Each image has its own title; the section has one overall comment on the state at reception.
- Selectable anomalies: produit colmaté; rotation libre de l'arbre; arbre bloqué; chaise de roue dégradée;
  palier dégradé; autre cas.
- An observation can be added as text or audio, even if it isn't in the list.
- Warning: **not a single photo** — the number of photos and their titles are requirements.

## Inspection des pièces — what each part lists (pages 5–6)

One part = one sub-page with the common template. Findings are specific to each part; several can be ticked; every
list has « Autre » and a free comment (text or audio); an explicit recommendation must be possible before moving to
the next part.

| Pièce | Constats proposés | Recommandations |
|---|---|---|
| Corps de pompe | bon état; brides d'aspiration/refoulement dégradées; produit colmaté; trous de fixation dégradés; traces de frottement; fissures; corrosion; érosion; surfaces de portée de joint dégradées; autre | nettoyage et réutilisation; réparation et réutilisation; remplacement / nouveau corps |
| Roue | **list not given yet**: a configurable list, don't invent one | (same template) |
| Palier | bon état; contamination par l'eau; alésage côté DE ou NDE hors tolérance; décoloration due à un échauffement; trous de fixation dégradés; usure; autre | nettoyage et réutilisation; réparation et réutilisation; remplacement du palier |
| Roulements | bon état; contamination par eau / acide; grippage; usure normale; casse; autre | changement systématique, or another decision entered by the user |
| Arbre | bon état; partie de fixation avec la roue usée; cône / filetage endommagé; rainure de clavette DE ou NDE dégradée; traces de frottement; décoloration due à un échauffement; ajustements des roulements hors tolérance; concentricité hors tolérance; autre | nettoyage et réutilisation; réparation et réutilisation; remplacement |
| Flasque côté pompe | bon état / dégradé / autre (own page) | nettoyage et réutilisation; remplacement |
| Flasque côté accouplement | bon état / dégradé / autre (own page) | nettoyage et réutilisation; remplacement |
| Déflecteur | bon état / dégradé / autre | a fitting recommendation |
| Autres pièces | « + Ajouter une pièce » creates a page: part name, titled photos, state / findings, comments, recommendation | — |

Adding a part must not require changing the form's code.

| Cas d'usage | Comportement MVP attendu |
|---|---|
| Pièce non inspectée | Can move to the next one without losing the report's structure |
| Pièce ajoutée manuellement | Appears in the navigation and in the final parts table |
| Plusieurs anomalies | Every selection kept and shown in the summary |
| Commentaires particuliers | Not limited by the pre-filled choices; text / voice available |

UX recommendation: one configurable **« InspectionPièce »** component (labels, anomalies, recommendations) rather
than a rigid screen per part.

## Contrôles géométriques et dimensionnels (page 7)

Measures are entered one after the other, readable, with visuals, and usable without averaging by hand.

**Écran 4 — Contrôles géométriques**: one sub-page per measure and per phase, each with its illustration.

| Nature du contrôle | Au démontage | Au remontage |
|---|---|---|
| Concentricité | Page dédiée | Page dédiée |
| Déplacement axial | Page dédiée | Page dédiée |
| Déplacement radial | Page dédiée | Page dédiée |
| Perpendicularité | Page dédiée | Page dédiée |

So 8 pages. Each page: an image of the measure, the value field, a **« + Ajouter une prise »** button, a table of
every reading and the average computed automatically:

| Prise | Valeur mesurée | Actions |
|---|---|---|
| 1 | [valeur] | Modifier / supprimer |
| 2 | [valeur] | Modifier / supprimer |
| 3 | [valeur] | Modifier / supprimer |
| Synthèse | Moyenne automatique | Conserver les valeurs brutes |

**Écran 5 — Contrôles dimensionnels arbre et palier**
- The shaft's image, the cross-section view and the measures table.
- Bearing clearances and concentricity values, several readings when needed.
- **No invented tolerances**: any « conforme / hors tolérance » depends on a validated reference first.

UX recommendation: a unit next to each measure (the business reference's, to confirm). Averages never erase the
individual readings.

## Garniture mécanique (page 8)

A section of its own with four sub-pages, each with the template (titled multi-image gallery, multi-choice
findings, free comment, recommendation):

| Sous-composant | Constats proposés | Recommandations |
|---|---|---|
| Face stationnaire côté process | bon état; rayures ou piqûres; rayures/piqûres profondes; face fissurée; face cassée; usure logement du pion; support de grain dégradé; usure/corrosion/érosion; pièce manquante à réception; autre | nettoyage + réutilisation; rodage + réutilisation; remplacement |
| Face rotative côté process | bon état; rayures ou piqûres; rayures/piqûres profondes; face fissurée; face cassée; usure logement du pion; pièce manquante à réception; autre | nettoyage + réutilisation; remplacement |
| Chemise | bon état; usure des portées de joints; traces de frottement; usure/corrosion/érosion; autre | polissage + réutilisation; réparation + réutilisation; remplacement |
| Couvercle de boîte à garniture | bon état; usure de portée de joint; usure/corrosion/érosion; autre | polissage + réutilisation; réparation + réutilisation; remplacement |

« logement du pion » and « pièce manquante à réception » are harmonised wordings, to be validated by the business.
- Each sub-component is independent in the journey and in the summary.
- Several images, each keeping its title and comment.
- Recommendations belong to the sub-component, not one generic list for the whole seal.
- An anomaly or recommendation that isn't listed can still be added.

## Synthèse et décisions client, galleries (page 9)

Keep the **technical recommendation** (from the inspection) apart from the **client's final decision** and from
**who does the work**.

**Écran 7 — Tableau récapitulatif**

| Quantité | Description | Code | Recommandation | Décision client | Remarque |
|---|---|---|---|---|---|
| [Qté] | [Pièce] | [Code] | Garder / réparer / changer | Client (ex. OCP) / PHOVA / récupérer / autre | Non conforme / réparé / manque fixation / autre |

- Rows generated from the inspected parts, editable, rows can be added. *(UX recommendation)*
- A part recommended for replacement does **not** automatically become "replaced by PHOVA".
- Who handles it: the client / OCP or PHOVA, and the « à récupérer » case.

**Écran 8 — Pièces remplacées / réparées**: a gallery (new bearings, repaired parts, the seal changed by OCP,
boxes / covers to repair, special cases: soufflures, non-conforming surface, rodage). Each photo has a title and a
comment.

**Écran 9 — Commentaires supplémentaires**: free observations, several photos with comments, even when they match
no standard part.

**Écran 10 — Pompe assemblée**: the final photos of the reassembled pump (one or more), their titles, comments on
the state after assembly.

UX recommendation: one reusable gallery component for the three, but **separate sections** in the navigation and in
the report.

## Check-list finale de contrôle de montage (page 10)

The last operational section, a simple table after the assembled pump's photos.
Header: date de montage; order / batch identifier when applicable (label to confirm); author of the check or of the
montage report. Columns: description; status (selectable); remarks (each row can be commented).

| N° | Description | Statut | Remarques |
|---|---|---|---|
| 01 | Contrôle général de la propreté | [choix] | [texte libre] |
| 02 | Conformité visuelle des pièces à monter | [choix] | [texte libre] |
| 03 | Contrôle du centrage de l'arbre | [choix] | [texte libre] |
| 04 | Contrôle de la concentricité de la boîte à garniture | [choix] | [texte libre] |
| 05 | Contrôle des jeux et déplacements radial et axial de l'arbre | [choix] | [texte libre] |
| 06 | Contrôle de la perpendicularité de l'arbre / boîte à garniture | [choix] | [texte libre] |
| 07 | Test d'étanchéité de la garniture avant montage | [choix] | [texte libre] |
| 08 | Contrôle du serrage de la visserie de la pompe | [choix] | [texte libre] |
| 09 | Ajustage du jeu hydraulique de la pompe | [choix] | [texte libre] |
| 10 | Test d'étanchéité de la garniture après montage | [choix] | [texte libre] |
| 11 | Test d'étanchéité de la pompe | [choix] | [texte libre] |
| 12 | Protection des orifices de la garniture mécanique | [choix] | [texte libre] |
| 13 | Protection des orifices d'aspiration et de refoulement | [choix] | [texte libre] |

UX recommendation for the statuses: **Conforme, Non conforme, Non applicable, À reprendre**, to validate with the
business before locking. (Today's montage form has 12 Bon / Mauvais checks.)

## Priorities and acceptance (page 11)

| Priorité | Attendu |
|---|---|
| P0 | Navigation by sections / sub-pages; complete first page; per-part inspection template; titled multi-image galleries; findings and recommendations specific to each part |
| P0 | Choices and comments saved when changing page; free « Autre » entry; parts added dynamically |
| P0 | Geometric and dimensional checks with several readings, individual values and automatic average |
| P0 | Mechanical seal in four sub-pages; client decisions table; final gallery; montage checklist |
| P1 | Draft / resume; overview of completed sections; report preview; handling of empty fields |
| P1 | Audio help (recording or dictation, depending on the technical choice); date picker and contextual input help |

The redesign passes when these scenarios work:
1. Create an expertise, fill in all of Informations générales on one page, go on to the reception.
2. Add three photos to a part with three different titles, tick two anomalies and one recommendation.
3. Create an « Autre » part; its page is added and it appears in the summary.
4. Enter three values for a check; the average is right and the three readings are kept.
5. Tell apart a part's recommended replacement and the client's decision about who handles it.
6. Fill in the 13 montage checks with statuses and remarks, then go back to an earlier section without losing data.

**Don't**: turn the 11 sections into one form; force one photo per component; use the same anomalies for every
part; mix up technical opinion and client decision.

## To confirm before building (page 12)

| Point à confirmer | Pourquoi |
|---|---|
| Exact labels of components and defects | Especially « logement du pion », DE/NDE marking, the flanges' names |
| The impeller's (roue) full defect list | Not provided; don't invent it |
| Units, tolerances, calculation method | Averages are asked for; acceptance thresholds and metrology are undefined |
| Final client decision options | Generic labels, or « OCP » shown explicitly |
| Exact montage statuses | Which states per check, and « non applicable » |
| Audio input format | Kept voice note, automatic transcription, or both |
| Montage / batch identifier | Mentioned orally; label and structure to confirm |

**Delivery asked**: rework the MVP along this journey, starting with a **clickable mockup** showing at least
(1) Informations générales, (2) réception, (3) one part's inspection with several photos, (4) a check with several
measures, (5) the mechanical seal, (6) the client decision summary, (7) the montage checklist. After the journey is
validated, build the reusable forms and the anomaly / recommendation reference.

Expected result: a smooth, step-by-step expertise usable in the field, true to the technical structure of the
démontage and montage reports.

## Implementation — v2 forms (8 November 2026)

Option A: the generic forms, extended. Three new forms, standing apart from the old ones:
**Rapport d'expertise V2 (démontage)** (93 questions, sections 01–07, measures at démontage),
**V2 (montage)** (59, Informations générales + 04/05 at remontage + 08–11), **V2 (complet)** (138, all 11).
Bodies: `rapport_v2_demontage.json`, `rapport_v2_montage.json`, `rapport_v2_complet.json` (POST /api/v1/forms/).

- **Labels** build the pages: `Rubrique : Champ`, or `Rubrique > Sous-page : Champ` for one page per part
  (` > `, since some section names hold a ` / `).
- **Backend**: new answer types `DATE`, `SINGLE_CHOICE`, `MULTI_CHOICE`, `MEASURE`, `PARTS_SUMMARY`; `options` (JSON) on
  each question (choices, exclusive « Bon état », allowOther, nonConforming, remark, unit, drawing, maxPhotos,
  photoComments, group, meta); answers stored as JSON, checked and read back by `StructuredAnswers`; photos with a
  title and comment (up to 30 on v2); added parts in `CheckListSubmission.extraParts`; blanks allowed on v2; a
  critical choice in `nonConforming` needs a comment and makes the report NON_CONFORME (the 13 montage checks).
- **Front**: `ReportForm.jsx` opens a v2 form as the wizard (`ReportWizard.jsx`, `ReportV2Fields.jsx`, `reportV2.js`),
  any other form as before. The review page (`ReviewReport.jsx`) shows readings, the summary table, photo titles and
  added parts.
- **Before creating the forms, once per database**: `ALTER TABLE check_list_item DROP CONSTRAINT IF EXISTS check_list_item_answer_type_check;`

Choices made where the document leaves it open (to validate): the impeller (roue) has only « Bon état » + « Autre »
and the generic recommendations; geometric checks keep the paper report's 5th one (concentricité de la boîte à
garniture); the seal keeps an « Identification » page (fabricant, type, n° de plan, photos) before its 4 sub-pages;
the montage report holds the remontage measures (04/05); units default to mm; montage statuses are the document's
four, « Non conforme » and « À reprendre » counting as non conforme.

**PDF (point 9, done 8 November 2026)**: `templates/expertise-report-v2.html` from `ExpertiseReportV2`, laid out like
the wizard: the three logos and the PHOVA footer, the report's identity, one dark band per section, one block per
part with its titled photos (two per row), every finding with its box ticked or not and « Autre » with its text, the
recommendation, each measure's drawing, readings and average, the parts summary (recommendation apart from the client's
decision), the 13-check montage table with « Non conforme » in red and its remark, the added parts, a part not
inspected marked « Non renseigné ». Choices come back with their full list (`StructuredAnswers.describe`) for this.

Tested locally (8 November): the three forms created, reports sent through the API (refusals: « Bon état » with an
anomaly, a reading that isn't a number, an unknown recommendation, a non conforme check without remark; NON_CONFORME
with one) and from the browser (photo uploaded and titled, finding, readings), PDFs rendered and checked page by page.

A form's title, instructions and labels are limited to 255 characters (varchar columns): a longer text is refused
with a 400 naming the field (`FormCreationDto`). « Form already exists » (409) now only means a duplicate title.

Input help (8 November, second pass):
- « + Autre » opens a box with « Ajouter » (or Entrée): the typed value becomes a ticked choice among the listed ones
  (findings: several, unticking one removes it; recommendation / status: one, choosing another replaces it). Several
  typed findings travel as one `other`, joined by « ; »; the review page and the PDF show each as a ticked box.
- Short fields with known values (client, adresse, fabricant, type, fluide pompé, raison, the seal's fabricant / type /
  n° de plan) show the full report's suggestions: ticking one fills the field, unticking empties it.
- Every typed field has a microphone (texts, « Autre » boxes, readings, checklist remarks, summary part / remark, added
  part, general remarks). Each clip is sent with its context (`dictationContext`): the server uses it as Whisper's
  whole prompt, so it carries the vocabulary, the page and the choices listed there. A short field takes the
  dictation in place of its value (as the suggestion it names); a reading said aloud is added as a reading.
  Pages stay put while a dictation records or transcribes.
- Identification formats (`FIELD_FORMATS`, reportV2.js), shown as the empty field's example, given to the transcriber
  as sample values, and applied to a dictated value: N° de commande 4000XXXX, N° d'opération WO-RO-055xxx, Matricule
  11xx11xx, Type OTC125-43, Fluide pompé « acide 53% », Repère géographique 03XYP03 (x = digits, XYP = letters).
- PDF, Contrôles dimensionnels: each group of measures (options.group) is one measurement sheet — drawing on top, a
  row per mark (J, X, J5…, C1…), a column per reading, the average last, « Non mesuré » for a blank mark.

- Measures: « Marquer hors tolérance » on each measure, the technician's flag (no tolerance is stored yet); red in
  the review page and the PDFs (report_pdf.md).

Built 8 November (after the coverage review):
- **Drafts and « Enregistrer »** (P1): the wizard saves a draft (`FormDraft`, `/api/v1/drafts`, form-draft-persistence.md)
  on every page change, on « Enregistrer » (footer and last page) and when the app goes to the background; the form
  opens on its draft (« Brouillon repris… », « Recommencer à zéro »), photos by id with their previews fetched again;
  the server deletes the draft when the report is sent (same transaction). A photo still uploading isn't kept.
- **Photo comments on every part** (page 8): the part and seal photos of the démontage and complet forms take a title
  and a comment (`photoComments`), and so do the added parts' photos. « Pompe réceptionnée » keeps titles only (page 4).
- **Preview before sending** (P1): « Aperçu du PDF » on the last page, `POST /api/v1/submissions/preview`: the PDF as it
  stands, marked « Aperçu — rapport non envoyé », nothing saved, nothing refused for being incomplete.
- **Searchable lists** (page 4, Client / dossier): the six fields are lists with a search (accents and case ignored):
  the suggestions, then the values already written in earlier reports (`GET /api/v1/submissions/known-values`); any
  other value can still be typed.

Not done (point 10, later): keeping voice notes.
