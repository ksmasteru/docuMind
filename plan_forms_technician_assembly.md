# Plan: technicians fill the control sheets; the assembly report (RASSN-02) as a form

Started 21 November 2026. Request: from PHOVA's forms folder (`~/Desktop/forms_phova`,
`~/Downloads/Rapports pour digitalisation dep qualité et manu`), add the reports not covered yet and make them
fillable by the technician (`USER`).

## Where things stood

| Paper form | In the app | Technician can fill |
|---|---|---|
| EN-CPE-QU-01 contrôle qualité par échantillonnage | `forms/quality/` | no, QUALITY only (decision of 10 Nov) |
| EN-PFD-MIC-01 contrôle usinage | `forms/quality/` | no, QUALITY only |
| EN-PFD-MIC-03 contrôle par ressuage | `forms/quality/` | no, QUALITY only |
| EN-PFD-MIC-04 certificat d'épreuve hydrostatique | `forms/quality/` | no, QUALITY only |
| EN-PNC-QU-01 non-conformité · QU-02 réclamation client · QU-03 dérogation · QU-04 réclamation fournisseur | `forms/quality/` | yes |
| **Rapport d'assemblage pompe (RASSN-02, the Word file)** | **not digitised** | — |

User's answers (21 Nov):
- **All 4 control sheets** become fillable by technicians, and QUALITY keeps filling them. This reverses the
  10 Nov rule that technicians must not see them.
- **Add the assembly report** as a new form for technicians, with its PDF in the PHOVA design.

## Part 1: control sheets open to technicians

- Add `USER` to `fillRoles` in the 4 JSON files (QUALITY stays). Read roles don't change: a technician reads
  their own sheets in « Fiches qualité », as everyone does.
- No frontend change: technicians already have « Formulaires » and « Fiches qualité », and the backend lists
  the forms by `fillRoles`.
- **Existing servers:** `init-server.sh` only creates forms and skips the ones that exist. A new step adds
  `USER` to these 4 forms' `fill_roles` when it's missing. It only adds and is safe to re-run. It would put
  `USER` back if someone removed it by hand later (noted in SERVER_SETUP.md).
- The Postman collection gets the same change.

## Part 2: the assembly report

### Why it goes through the v2 report machinery

The paper report has: per-part cards (photo, n° de série, comment, conforme / non conforme), measures (J1–J4,
C1–C5, geometric checks with drawings), the 12-point montage checklist with status and remarks. The v2 reports
already do all of this: the section wizard with titled photos, readings with averages, checklist rows with a
remark, and the PDF in PHOVA's design. The form is recognised as v2 by its title: « Rapport d'assemblage… » is
added next to « Rapport d'expertise V2… » (backend `StructuredAnswers.isV2`, frontend `isV2Title`).

### The form (`forms/workshop/RASSN-02_rapport_assemblage_pompe.json`), in the Word file's order

| Rubrique | Content |
|---|---|
| Informations générales | Ordre de fabrication: n° and date d'ordre de fabrication, date de réception des pièces, n° d'opération. Identification pompe: fabricant (suggests PHOVA Technology), type, **n° de série** (the report's equipment). Assemblage: **date d'assemblage** (the report's date) |
| Pompe assemblée | photos, commentaire, conformité (Conforme / Non conforme + remarque) |
| Contrôles dimensionnels > Arbre et palier | Jeux palier / arbre J1–J4 · Concentricités C1–C5 (drawing) · Jeu hydraulique J, X (drawing) · commentaire |
| Assemblage > one page per part | Roulements · Arbre · Assemblage arbre et roulements · Palier · Chaise de palier · Assemblage palier et chaise de palier · Fond de garniture · Garniture mécanique · Assemblage de la garniture · Roue · Volute · Flasque côté commande · Flasque côté garniture mécanique: photos, n° de série, conformité + remarque |
| Contrôles géométriques | Faux rond de l'arbre · Déplacement radial · Déplacement axial · Perpendicularité arbre / chaise · Concentricité arbre / chaise: a measure with its drawing, a comment |
| Contrôle de montage | ordre de fabrication n°, date fin assemblage; the 12 checks of the Word file, word for word (Conforme / Non conforme / Non applicable / À reprendre + remarque) |
| Points à améliorer | observations |

- **Fill roles:** `USER`. **Read roles:** QUALITY, WORKSHOP_LEAD, PROJECT_LEAD, SALES, like the control sheets.
- Conformity rows and checklist rows are **critical**. A « Non conforme » needs a remark (the wizard already
  says so) and makes the report « non conforme », as on the montage report.

### Choices to confirm with PHOVA

- « Fou rond » on paper is written « Faux rond », the usual term.
- The cards called just « Assemblage » on paper need their own names in the app: « Assemblage roulements et
  arbre », « Assemblage palier et chaise » and « Assemblage garniture », after the parts photographed before them.
- The Validation manufacturing / qualité boxes are signed on the printout. The app's own validation (a reviewer
  on a task) fills « Validation qualité » when there is one.

### The PDF (`expertise-report-v2.html`, `ExpertiseReportV2`)

- A new kind, `ASSEMBLAGE`. Cover: « RAPPORT D'ASSEMBLAGE » / « Assemblage pompe », with the facts that exist
  on this form (ordre de fabrication, type, n° de série, fabricant, dates…).
- **No page 2:** the design team's text describes an expertise.
- **Synthèse:** verdict « Assemblage conforme / non conforme ». Figures: pieces assembled, non conformes,
  checklist conformes, measures taken. The parts table has the columns Pièce · Conformité · Commentaire · Page.
- **A part card's state** is its conformity: green Conforme, red Non conforme.

## Steps

- [x] Control sheets: `USER` in the 4 JSON files, the Postman collection, init-server.sh step, SERVER_SETUP.md
- [x] Assembly form JSON in `forms/workshop/`; init-server.sh step 7 also creates `forms/workshop/*.json`
- [x] Backend: `isV2` knows the assembly title; `ExpertiseReportV2`: kind ASSEMBLAGE, conformity of a part,
      synthèse, cover facts
- [x] Template: kicker, no page 2, footer, parts table columns for ASSEMBLAGE
- [x] Frontend: `isV2Title` knows the assembly title (the section wizard)
- [x] Tests: every form JSON in `forms/` passes the server's option checks; the assembly PDF rendered and checked
- [x] Look at the assembly PDF; `mvn test`; frontend build
- [x] Memory: the 10 Nov rule changed

## How to check it

- `cd backend && ./mvnw test`: `backend/target/pdf-preview/assemblage.pdf` is a mock assembly report.
- On a server: `./scripts/init-server.sh` creates the new form and opens the control sheets to technicians.
  Sign in as a technician: « Formulaires » lists the 4 control sheets and « Rapport d'assemblage pompe ».

## Result (21 November 2026)

- **Tests.** `FormFilesTest` reads the 9 files in `forms/` as the server does: bean validation, then each
  question's options. It found that the assembly form's instructions were over the 255-character limit; they're
  shorter now. `ExpertiseReportPdfTest.rendersTheAssemblyReport` renders the Word file's assembly
  (WH.MO.00533, OTC 450-50, n° 16C003F), with one part made non conforme, to
  `backend/target/pdf-preview/assemblage.pdf` (16 pages).
- **Full suite.** Everything passes except `BackendApplicationTests`, which needs Postgres (Docker not
  running). The frontend builds, and eslint is clean on the changed files.
- **Added on the way.** The design dropped the verdict line. For a **montage or an assembly**, the synthèse's
  subtitle now starts with the verdict in its colour (« Assemblage non conforme · … »). Without it, a
  non-conforming montage didn't say so anywhere in the PDF. Expertise reports keep the design's subtitle.
- **Not tried in a browser.** The local stack (Docker) wasn't running, so the wizard wasn't opened with the
  new form. Its question types and options are the ones the v2 montage form already uses.


## Revision after the PDF version (21 November 2026)

The user sent the report as a PDF (`Rapport d'assemblage pompe WH.MO.00533 OTC450-50.pdf`). The first version
was built from the Word file's text alone, and had these wrong:

| On paper | First version | Now |
|---|---|---|
| Pompe assemblée: two boxes, « Rotation normale de l'arbre », « Conformité validée » | Conforme / Non conforme | two boxes to tick (MULTI_CHOICE, new option `checks: true`: no « Anomalies » state, ticked and empty boxes in the PDF) |
| Geometric checks: a value, « COMMENTAIRES », Conforme / Non-conforme each | the « hors tolérance » switch | a conformity with its comment per check; the geometry table gets a « Conformité » column and larger drawings |
| Jeu hydraulique X and J, one conformity, with the geometric checks | J and X under Contrôles dimensionnels | back with the geometric checks: two rows, « Jeu hydraulique (X) / (J) », one conformity (a check may now hold 2 measures) |
| The paper's own drawings: shaft with J1–J4 and C1–C5, perpendicularité and concentricité arbre / chaise, jeu hydraulique with J and X | the expertise drawings | taken from the PDF: `assemblage-arbre-palier`, `perpendicularite-chaise`, `concentricite-chaise`, `jeu-hydraulique` (backend `static/expertise`, frontend `public/expertise`). The other three are the app's existing drawings |
| A part: photo, comments + conformity, then n° de série | n° de série before the conformity | the paper's order |
| « Suite assemblage », « Liste de contrôle « Montage pompe » », « Points à améliorer identifiés », « Flasque côté GM » | my rewordings | the paper's names |
| Page 8: Validation manufacturing, Validation Qualité | Vérifié par, Dossier | those two signature boxes for this report |

The mock report (`ExpertiseReportPdfTest.rendersTheAssemblyReport`, `backend/target/pdf-preview/assemblage.pdf`)
now uses the paper's own values and its 11 photos (`backend/src/test/resources/assemblage/`, 468 KB, the bearings
photo turned upright as printed). Where the paper has no photo (Arbre, Flasque côté GM, Pompe assemblée), the mock
has none either. The signatures on page 8 were left out.

## Assembly ≠ expertise (21 November 2026)

The user specified that the assembly report is for a **new pump PHOVA manufactures**. The expertise reports
(démontage / montage / complet) are for a **client's pump that comes in for repair**. The assembly report shares
their wizard and PDF layout, but none of their wording:
- **PDF:** its own kind (`ASSEMBLAGE`): « RAPPORT D'ASSEMBLAGE » cover with the production order and serial
  number, no client, no expertise introduction page, conformity instead of recommendations, manufacturing /
  quality validation. It isn't linked to the repair loop (interventions, devis).
- **Wizard:** dictation now expects the form's own words (`vocabularyFor` in `reportV2.js`): the assembly report's
  parts and checks from RASSN-02, not a teardown's (« roue usée, aubes cassées… »). The last page says « Une page
  non renseignée… » instead of « Une pièce non inspectée… ».
