# Report PDF — ideas for a better expertise report

Proposal from 8 November 2026, after reviewing the current v2 PDF page by page
(`templates/expertise-report-v2.html`, `ExpertiseReportV2.java`) next to `report_ui.md` and the workshop loop
(`fix_workshop.md`). It also draws on how pump service centres and inspection-report guides structure their
reports. I found no standard template for pump teardown reports, but the sources describe the same practices.
Those practices, applied to the problems below, give these ideas. Nothing here has been built yet.

## What's wrong with the current PDF

1. **Nothing says what matters until page 3 or later.** OCP and the Chef de projet (who prices the devis) have to
   read every page to learn that the casing must be replaced. Every inspection-report guide I found starts with the
   critical findings: an overall result and a count of findings by severity.
2. **Space is wasted.** Each section starts on a new page, so "06 · Pompe assemblée : Non renseigné" takes a whole
   page. Page 1 has a 14-row table that is mostly "—" and half a page left blank. The three logos take about 30 mm
   at the top of every page.
3. **"Statut : Conforme" is misleading on a démontage.** Conformity belongs to the montage checklist. A démontage
   that finds a cracked casing still prints "Conforme" in green.
4. **Ticked and unticked findings look the same.** All 9 boxes for the casing have the same weight, so the 2 ticked
   ones get lost among them.
5. **No traceability.** The PDF doesn't show:
   - who reviewed and validated the report (the Workshop Lead at step 9 or 17);
   - the intervention (AT-00001) or the devis it led to;
   - which version of the report it is.

   Inspection-report guides list missing version tracking and weak photo labelling as common problems.
6. **"V2" appears in the title.** It's our internal name for the forms and shouldn't reach the client.

## Ideas, by impact

### 1. A summary page first (the most valuable change)

Page 1 would hold:
- **Header:** pump identity, client, intervention number, dates.
- **Overall state** (démontage) or **Conforme / Non conforme** (montage), written out in words.
- **Counters:** for example "8 pièces inspectées · 2 à remplacer · 1 à réparer · 5 réutilisables".
- **Parts table**, sorted by severity, one line per part: part, state, main finding, recommendation, page reference.
- **The Synthèse des pièces table**, which the Chef de projet uses for the devis.
- **One photo** of the pump as received.

All of this already exists in the data (recommendations, findings, synthèse), so no new fields are needed.

### 2. A coloured state per part

Each part's heading would show a coloured label derived from its recommendation:
- green: Réutilisation;
- amber: Réparation;
- red: Remplacement;
- grey: Non inspecté.

The same label would appear in the summary table. The word is always printed, so it still reads on a
black-and-white printout.

### 3. Part pages as compact cards

- Photos on the left, two per row, numbered (Photo 3.1, 3.2) so the text can refer to them.
- Findings and recommendation on the right.
- Ticked findings in bold with a filled box; unticked ones in small grey on one line. The spec requires every
  finding to appear, ticked or not, so I'd make the unticked ones quieter rather than remove them.
- Parts that weren't inspected grouped in one line, e.g. "Non inspectés : Palier, Arbre, Flasques", instead of a
  heading each.

### 4. Fewer pages

- A new page only for sections that have content; empty sections listed together in one line.
- Informations générales in **two columns, grouped** as in the form (Client / dossier · Identification pompe ·
  Motif). Empty fields would be dropped, or kept short and greyed.
- A **full logo header on page 1 only**. Later pages get a slim band: PHOVA logo, report reference, pump,
  "Page x / y".

  OpenHTMLtoPDF supports a separate first-page layout (`@page :first`), so this fits the current setup.

### 5. Traceability block (last page or under the summary)

The PDF would show:
- **Rédigé par:** the technician;
- **Vérifié par:** the Workshop Lead, with the date of validation at step 9 or 17;
- **Intervention:** AT-0000X;
- **Devis:** DV-…;
- **Version:** "Version 2 — corrigée après retour du 08/11". The data already keeps each sent version of a report.

A **QR code** linking to the report in the app would let OCP check that a paper copy is genuine.

### 6. Measurements: before / after, then against tolerance

- **Complet report:** put démontage and remontage side by side in one table (J: 0,41 → 0,30 mm). Pump repair
  records commonly document "as found" and "as left" values, and here that comparison shows what the work achieved.
- **Later, when PHOVA gives the values:** a Nominal / Tolérance column and a ✓ / ✗ per mark. Reference reports
  compare the "as inspected" value with the design value; we only have the readings today.

### 7. The final file (step 18, "Générer le dossier final")

One PDF that puts together:
- a cover page;
- a contents page;
- the démontage report;
- the devis;
- the montage report;
- the montage checklist.

It would use the same layout as the reports above. This is the document OCP keeps, and the button already exists,
waiting for it.

### 8. "Analyse / cause probable" section (needs PHOVA's agreement)

Service centres put root-cause analysis at the centre of their reports (Sulzer, Tencarva), and the PCM expertise
sheet is built as "constat → analyse → préconisations". Our report has findings and recommendations but no field
for the probable cause (cavitation, misalignment, product build-up…). `report_ui.md` says ergonomic changes must
not change the expertise logic without validation, so this one needs PHOVA's agreement first.

## What to do first

| Priority | Ideas | Needs |
|---|---|---|
| 1 | Summary page (1) · coloured state per part (2) · no "V2", right status for démontage | Nothing: the data already exists |
| 2 | Compact cards (3) · fewer pages, slim header (4) | Nothing |
| 3 | Traceability block (5) · before/after measures (6) | Review dates already stored; just pass them to the PDF |
| 4 | Final file (7) | The devis PDF, plus a decision on which step generates it (still open) |
| 5 | Tolerances (6), Analyse section (8), QR code | Values from PHOVA and their approval |

Priorities 1 and 2 are a rewrite of the template and of `ExpertiseReportV2` only: no change to the forms or the
database.

## Open questions

- **Who reads the PDF first: OCP or PHOVA's own team?** That decides whether the summary page leads with the parts
  to replace (for the client) or with the measurements and findings (for the workshop).
- **Should unticked findings stay visible?** They're required now, but if PHOVA accepts showing only the ticked
  ones, the part pages get much shorter.

## Sources

- [How to Write an Inspection Report (Fluix)](https://fluix.io/blog/inspection-report)
- [Inspection report writing — 8 best practices (Inspectors Journal)](https://www.inspectorsjournal.com/topic/18130-article-inspection-report-writing-8-best-practices)
- [Home inspection report checklist (Inspect & Test)](https://inspectandtest.net/guides/home-inspection-report-checklist/)
- [Pump Repair Services (GlobalSpec)](https://www.globalspec.com/learnmore/industrial_maintenance/pump_repair_services)
- [Pump repair process (Axflow)](https://www.axflow.com/en-gb/products-services/services/pump-repair/pump-repair-process/)
- [Repair and overhaul services (Sulzer)](https://sulzer.com/en/shared/services/repair-and-overhaul-services)
- [Submersible Pump Repair (Tencarva)](https://tencarva.com/?p=8442)
- [Fiche service expertise (PCM)](https://www.pcm.eu/sites/default/files/food/fr/fiche_service_expertise_fr_a.pdf)
- [Staff1 – 38 Condensate water pump 2021 (EKPC inspection report)](https://psc.ky.gov/pscecf/2024-00370/jessica.fitch-snedegar@ekpc.coop/01032025040034/Staff1_-_38_Condensate_water_pump_2021.pdf)
- [ANSI Centrifugal Pump Inspection Tips (Griswold)](https://www.psgdover.com/griswold/news/article/2022/07/04/pump-inspection---ansi-centrifugal-pumps)
- [Rapport Centrax (Bordeaux Métropole)](https://bordeaux-metropole.fr/sites/MET-BXMETRO-DRUPAL/files/bm_actes/organismes/bordeaux-metropole/conseils/2023-06-30/Annexe%25201a%2520-%2520Rapport%2520Centrax.pdf)

## Built (8 November 2026)

Ideas 1–7 are built for the v2 reports; ideas 6 (tolerances) and 8 (cause probable) still wait for PHOVA.

- **One report** (`GET /api/v1/submissions/{id}/pdf`): `templates/expertise-report-v2.html`, content shared with the
  final file in `templates/expertise/parts.html`; model `ExpertiseReportV2` (summary, part cards and their state,
  geometric checks as one table, measurement sheets, checklist), traceability from `ExpertiseDossierService.traceOf`
  (intervention, version, reviewer at step 9 / 17, devis).
- **Final file** (`GET /api/v1/interventions/{id}/dossier/pdf`): `templates/expertise-dossier.html`, model
  `ExpertiseDossier`, built by `ExpertiseDossierService.dossier` from the intervention, its latest démontage and montage
  reports and its devis: cover (avant / après), sommaire, synthèse, avant / après, mesures démontage vs remontage,
  devis, both reports, historique and signatures. Button « Générer le dossier final » (`DossierButton.jsx`) on the
  step 18 page and on the intervention page from step 18 on. Readable by every workshop role.
- **The démontage and montage reports alone** follow the final file's style: cover (navy band, two photos of the
  pump, verdict, identification), sommaire with page numbers, « 01 Synthèse et identification », then one chapter per
  rubrique of the form (each on a new page, with a line counting what it holds), and « Traçabilité et validation ».
  Inside the final file the same reports keep their compact layout (`sections(r, p, false)` in `expertise/parts.html`).
- A part's state comes from its recommendation: remplacement / changement → à remplacer; réparation, rodage,
  polissage, rechargement, usinage → à réparer; nettoyage, réutilisation → réutilisable.
- Old (v1) reports still use their own PDF; inside a final file they are shown through the same layout, with less
  structure (no part states, no measure comparison).
- **Hors tolérance (idea 6, option A, built 8 November):** each measure in the v2 forms has a « Marquer hors tolérance »
  switch (enabled once a reading is entered), saved with its readings as `{ readings, out: true }`. The PDFs show the
  line in red with « Hors tolérance », a fifth figure and a « Mesures hors tolérance » table in the synthèse, and the
  flags in the final file's avant / après comparison. It's the technician's judgement: no limit is stored, and the
  montage verdict is unchanged (making a flagged remontage measure « non conforme » needs PHOVA's agreement). Option C
  (limits per pump type) can take over later.

