# Plan: the chat knows the pump from the app, not from the question

Asked on 2026-11-24 (points 1 and 2 of the chat review), revised the same day: the technician never names
the pump, so the pump type comes **from where the chat is opened**. Status (2026-11-25): step 0, parts A, B and C done and checked, D1–D3 done (D2: the rapports folder). Next: D4 (server).

Builds on what is already in `AskService`: `answerGeneralWithAiRag` (prompt 2.1: whole shared library, equipment
given to the model as context, general practice marked « (pratique générale) », never an invented figure).
That stays the fallback, unchanged.

## What we already have

- `PumpModel` (table `pump_models`, one row per `PumpType`) with a many-to-many `manuals` →
  table `pump_model_manuals(pump_model_id, file_id)`. Created by `ddl-auto=update`, **never used**.
- The registry: `Pump` (id = equipment code, `PHB3-J-07`) → `Pump.model` (`PumpType`, may be null).
- The task screen already sends the task's equipment with each question (`AskRequest.equipment`).
- The upload form has a **title** (`FileEntity.name`), and the chat's sources show it.
- Upload (« Importer ») is an ADMIN tab.

## Design

### 1. A document says which models it serves (data, not code)

- At upload, the admin ticks the models it applies to: `OTW  OTC  OTS  PHB2  PHB3  PHH` (list from the
  server, `PumpType`). One document can serve several models.
- **None ticked = general documentation** (standards, procedures, PHOVA reports).
- On « Documents », each file shows its model chips; the admin can change them without re-uploading.
- Whether AHLSTAR.pdf counts as the OTW's manual is then PHOVA's choice, made on that screen, not in code.

### 2. The pump type comes from the context, resolved in one place on the server

```
AskRequest { question, equipment?, pumpModel? }
  │
  ├─ pumpModel sent by the screen?            → that model    (a picker on /ask, later the report form's « Type »)
  ├─ else equipment in the registry?          → Pump.model    (PHB3-J-07 → PHB3)
  ├─ else equipment code starts with a model? → that model    (OTW-JORF-01, a pump not registered yet:
  │                                                            the convention prompt 2.1 already states)
  └─ else                                     → no model
```

The question text is never searched for a pump name (so no more « plusieurs pompes » refusal either).

### 3. Two answering modes, one prompt

| Scope | When | Searched | Shown to the technician |
|---|---|---|---|
| `MANUALS` | a model, with at least one manual linked | its manuals ∪ general documents | the answer |
| `NO_MANUAL` | a model, no manual linked | whole library, as 2.1 does now | « Aucun manuel n'est rattaché à la PHB3 : réponse générale. » then the answer |
| `NO_MODEL` | no model found in the context | whole library, as 2.1 does now | « Pompe non précisée : réponse générale. » then the answer |

- Same system prompt (2.1 → 2.2). Only the user prompt's context lines change:
  - `MANUALS`: « Modèle : PHB3. Les extraits viennent des manuels rattachés à la PHB3, qui peuvent nommer la
    pompe autrement (c'est la même machine), et de la documentation générale. »
  - the two others: today's « Équipement de la tâche : … », plus « Modèle : non précisé » or « Modèle : PHB3
    (aucun manuel) ». The 2.1 rule « s'il vient du manuel d'une autre pompe, dis-le » already covers a whole-library
    search.
- Nothing is rewritten, neither the question nor the answer. Sources show the document's title.
- The notice is **not** part of the answer text: `AiResponse` gets `scope` and `pumpModel` (two extra fields:
  old clients ignore them), and `AskChat.jsx` words the notice in French above the answer. The answer stays
  clean, and the notice can't be lost by the model.
- `AskInteraction` records `scope` and `pumpModel` (two nullable columns, added by `ddl-auto`: no server step), so
  we can count how often a question had no model or no manual, which shows what's missing in the library or the registry.

### 4. Every answer carries its sources, built by the server

Today the model **writes** the `sources : a, b` line and `AskChat.jsx` turns it into chips. So the chips show
whatever the model typed (a misspelt title, a file it didn't use, « connaissances générales » with a file icon),
and they vanish if the model puts its two last lines in the other order.

- The server builds the list from the `chunks : 0, 3` line, the excerpts the model says it used:
  excerpt → chunk → file → **title**, one entry per document, in the order first used.
  `AiResponse.sources = [{ fileId, title, pages? }]`.
- Both trailing lines are stripped from the text; `AskChat.jsx` stops parsing text and shows `sources` as chips.
- **General practice is a source too:** when the answer contains « (pratique générale) » or the model wrote
  « sources : connaissances générales », a separate « Pratique générale » chip (no file icon), so the technician
  sees at a glance what no PHOVA document confirms.
- **If the `chunks` line is missing or unreadable:** match the names of the `sources` line against the titles of
  the excerpts sent; if nothing matches, « Sources non indiquées » and a log line. Never fall back to « the 12
  excerpts sent »: that would cite documents the model didn't read from.
- **A chip opens the document** (`/api/v1/files/preview/id/{id}`, already there).
- **Pages:** chunks don't store a page today (500 words across page breaks), so the chips say « AHLSTAR » and
  not « AHLSTAR p. 23 ». Adding `pageStart`/`pageEnd` to chunks means re-ingesting every document, as the
  header/footer fix does: both should go in the same re-ingest (point 3 of the review), and the chip then opens
  the PDF at that page (`#page=23`). Not in this plan.
- **Kept for later review:** `AskInteraction` already stores every excerpt sent with its distance and
  `usedChunk`; nothing to add.

### 5. Spec questions, and PHOVA's spec sheets (proposal, 2026-11-24, from the baseline)

Example: « vitesse de rotation maximale de la pompe » (Q35 of the baseline, answered « 3550 tr/min » for an OTW
from the PFA report's PHH line). What the documents hold today: the OTW's manual (AHLSTAR) gives no single maximum
speed, only « on the nameplate (item 5) and in the documents supplied with the pump », plus a noise table whose
column headers are speeds (3550 … 445 rpm, not limits). The PFA report gives PHB2 up to 2 960 / 1 470 tr/min
(2 / 4 poles) and PHH up to 3 550 tr/min, and for the OTW flow, head, 25 bar and 200 °C, no speed.

Three changes so that such a question is answered right before and after PHOVA's spec sheets exist:

- ~~`NO_MANUAL` searches the general documents only~~: replaced by §6 (asked 2026-11-24: a similar pump's figure may
  be used, but the technician must always know it's not his pump's).
- **Multi-model documents (the PFA report) can't be tagged per section:** tagged with all its models or left as
  general, its PHH line reaches an OTW question **without any label** (§6 can only label by document). So it has to
  leave the assistant, or be split into one document per model; its figures go into the spec sheets.
- **A model's spec sheet is always in the prompt**, ahead of the search results, when that model is resolved
  (`MANUALS` and `NO_MANUAL`): a short document per model, tagged with it and marked « fiche technique ». A spec
  question then never depends on retrieval ranking. Format to give PHOVA: one file per model, `.md` or `.txt` (no PDF
  table flattening, no page headers), the model in the title, one value per line with its unit and its condition
  (« Vitesse de rotation maximale : 2 960 tr/min (moteur 2 pôles, 50 Hz) »), short enough to be one chunk.
- Prompt 2.2: a figure read in a table only answers the question if the table is about that quantity (a speed in the
  header of a noise table is not a speed limit).

### 6. A figure from another pump is always labelled, by the server, not by the model

Requirement (2026-11-24): when the asked pump's own value isn't documented and the answer uses a similar pump's,
**the technician has to know it's not his pump's**. The baseline shows the model can't be trusted to say it (7 of 40
answers gave another pump's figure as this one's, despite prompt 2.1's rule), so the server adds the label.

- **The link says what the document is to the model** (`pump_model_manuals` gets a `kind` column):
  `OWN` = PHOVA's own document for this model (its spec sheet, a PHOVA manual), `COMPARABLE` = the manual of a similar
  pump used as reference (AHLSTAR for the OTW, HDX for the PHB2). Chosen by the admin next to the model chip.
- **Every excerpt sent gets its relation to the asked pump**, computed by the server from the links:
  `OWN` · `COMPARABLE` · `OTHER` (only linked to other models) · `GENERAL` (no link).
- **Search per scope:**
  - `MANUALS` (the model has `OWN` or `COMPARABLE` documents): those + general documents;
  - `NO_MANUAL`: the whole library (the « réponse générale » asked for), every excerpt with its relation;
  - `NO_MODEL`: the whole library, every excerpt labelled with the model(s) its document is about.
- **The model is told** in each excerpt header (« --- Extrait 3 · HDX · documentation de la PHB2, pas de l'OTW --- »),
  so it can say it in its own words. That's only a help, not the guarantee.
- **The guarantee: the server labels the answer.**
  - With the inline citations of part A, any sentence citing a `COMPARABLE` or `OTHER` excerpt gets a label.
  - **Figure check** (the baseline's automatic check, moved into the server): every number in the answer is looked up
    in the excerpts sent. Found only in `COMPARABLE` / `OTHER` excerpts → labelled with that pump, even if the model
    cited nothing. Found in no excerpt → « chiffre non documenté, à vérifier » (it catches Q8's 70 °C, Q25's range).
    Numbers from the question, the equipment code and the system prompt don't count.
  - `AiResponse.warnings = [{ kind: COMPARABLE | OTHER | UNDOCUMENTED, figure?, model?, document? }]`, shown by
    `AskChat.jsx` as an amber block under the answer, one line each; the chip of such a document says « pompe
    comparable » or « autre modèle : PHB2 ». The warnings are saved with the interaction.
- What the technician sees, OTW task, before PHOVA's spec sheet (values from the baseline's Q31):

  ```
  Huile minérale ISO VG 46, par exemple Shell Tellus S46 ou Mobil DTE Medium [1].
  Viscosité à la température de service : au moins 12 cSt [1].

  ⚠ ISO VG 46, 12 cSt : manuel d'une pompe comparable (AHLSTAR), pas un document de l'OTW.
    À confirmer pour l'OTW-JORF-01.
                                         Sources : [AHLSTAR · pompe comparable]
  ```
  and for Q24's alignment tolerance, asked from the same OTW task:
  `⚠ 0,05 mm : manuel d'un autre modèle (PHB2 · HDX), pas de l'OTW.`
- Once the OTW's own spec sheet is linked (`OWN`), its figures come without a label.

### 7. Spec sheets: installed by the app, then kept up to date by the admin (asked 2026-11-24)

- **Bundled with the backend:** `backend/src/main/resources/specs/specs_<MODEL>.txt` (moved there on 2026-11-24; the
  Docker image only copies `backend/src`). One copy, no repo-root folder any more.
- **Installed at startup, once per model.** After the `pump_models` rows exist, for each model that has a bundled
  sheet and **no spec sheet linked yet**: create the document « Fiche technique <MODEL> » (owner `system`), ingest it
  (chunks + embeddings, one call per sheet), link it to the model as `SPEC`.
  - A model that already has a spec sheet, the installed one or the admin's, is never touched: a restart or a
    redeploy never overwrites what the admin did.
  - If OpenAI or the database isn't reachable at startup, it logs and tries again at the next start; the app starts anyway.
- **`SPEC` is a third link kind**, next to `OWN` and `COMPARABLE` (§6): at most one per model. It's the sheet put at
  the top of the prompt (§5), and its figures are never labelled (§6).
- **The link becomes an entity** (`PumpModelDocument`: model, file, kind, origin `INSTALLED` / `ADMIN`, hash of the
  installed text, changed by, changed at), in a new table `pump_model_document`. The `manuals` many-to-many of
  `PumpModel` and its table `pump_model_manuals` are dropped from the code: never used, empty, and a JPA join table
  can't carry those columns. `ddl-auto` creates the new table; dropping the old one is an optional line in
  `init-server.sh`.
- **Everyone reads them in the web app** (asked 2026-11-24): a « Fiches techniques » page in the « Documentation »
  group, for every role that has « Documents » or works on pumps: ADMIN, MANAGER, USER (technician), WORKSHOP_LEAD,
  PROJECT_LEAD. One card per model: title, description, the « Caractéristiques » lines as a two-column table
  (label · value), the « à compléter » lines shown as missing values, last change and by whom. A sheet the admin
  replaced by a PDF shows its preview instead (`/api/v1/files/preview/id/{id}`).
  - **On the pump page** (`/pumps`, `Pumps.jsx`, asked 2026-11-24 with a screenshot of PHB3-J-11): the « Fiche » tab
    shows two blocks, « Fiche de PHB3-J-11 » (the registry record, as today, `PumpRecordPanel`) and under it
    « Fiche technique PHB3 », the model's sheet in the same card as the « Fiches techniques » page. The sheet shows
    even for a pump not registered yet (model from the fleet), and links to the « Fiches techniques » page.
  - **Its « Documentation » tab** (`DocumentationPanel`, `PumpPanels.jsx`) lists the model's linked documents instead
    of searching file names (`GET /api/v1/files/{model}`, the same weakness as the chat's point 1), each with its kind:
    « Fiche technique », « Manuel PHOVA », « Pompe comparable (AHLSTAR) ». A manual named after another model shows
    up there once linked.
  - On the task's « Détails » tab, a « Fiche technique PHB3 » chip (the task's equipment → model, same resolution as
    the chat) opens the sheet.
  - Read endpoints for the model's documents: `GET /api/v1/specs/{model}` (the sheet) and
    `GET /api/v1/pump-models/{model}/documents` (all linked documents with their kind).
  - Read endpoints for any logged-in user: `GET /api/v1/specs` (all models), `GET /api/v1/specs/{model}`.
  - The sheet card is one component (`SpecSheetCard`), used on the page, the pump page and behind the task's chip.
- **The admin keeps them up to date on the same page** (the buttons only show for ADMIN; the backend refuses the
  others):
  - « Modifier »: the text in a text area. Saving makes a new document, ingested and linked in place of the old one,
    whose document and chunks are deleted. That's how the « à compléter » lines get filled.
  - « Remplacer »: upload a file (`.txt`, `.md` or `.pdf`), same result.
  - « Télécharger ». A model with no sheet (added to `PumpType` later, with no bundled file) shows « Ajouter ».
  - Edit endpoints under `/api/admin/specs` (ADMIN enforced by `SecurityConfig`'s `/api/admin/**` rule).
  - No version history: an edit replaces the previous version (kept unless asked otherwise).
- **What the chat puts at the top of the prompt** (§5) is the sheet's text: the document itself for a `.txt` / `.md`,
  its excerpts in order for a PDF.
- **A newer bundled sheet** (a developer edits `specs_OTW.txt` in a release) replaces the installed one only if the
  admin never changed it: at startup, origin `INSTALLED` and stored hash ≠ the bundled file's hash → reinstalled.
  Once the admin has edited a sheet, the bundled file never wins.
- No server step: the rows and the sheets are created by the app. `SERVER_SETUP.md` gets one line saying so, and where
  the admin edits them.

## Steps

Three slices, each one usable and tested on its own before the next. A is independent of the pumps and
can go first; C needs B.

### 0. Before (baseline)

- [x] Pick 40 questions: breakdowns, checks, repairs, manual figures, reports, safety, off-topic
      (`SELECT question_raw, ask_outcome, pump FROM ask_interaction ORDER BY created_at DESC LIMIT 30`)
- [x] Ask them from a task's « Ask » tab (e.g. `OTW-JORF-01`) and from `/ask`; note answer, chips, outcome in the
      « Before / after » table at the end of this file. Done 2026-11-24: `ask_baseline_2026-11-24.md`
      (40 questions: full answers, excerpts, verdicts), re-run with `scripts/ask_baseline.py`
- [x] Note: `AskSharedDocumentsTest` still tests the old pump-name rules (`answerPhovaWithAiRag`, now commented
      out), so it fails against 2.1; it's replaced in C3. `AskGeneralAssistantTest` must stay green throughout.

### A. Sources built by the server (decided 2026-11-24: inline « [n] » citations; question 5: the server keeps a closing « sources : » line for the mobile app)

- [x] A1. `AiResponse`: `sources = [{ fileId, title }]` + `generalPractice`; the three-field constructor kept for
      `/ask/image` and `/transcribe`
- [x] A2. Prompt 2.2: excerpts numbered « --- Extrait [n] · fichier : … --- », the model cites « [n] » after each fact
      and writes no closing list. `AnswerCitations` reads the markers (only numbers within the excerpts sent; « [à
      compléter] », « [0,05 mm] », « [12] » of 10 stay as text) and takes them and any old closing lines off;
      `AskService.recordAnswer` builds the sources from the cited excerpts (one per document, in citation order),
      sets `usedChunk`, falls back to matching a model-written « sources : » line to the titles (« fichier1 »
      matches nothing), `generalPractice` when no document or « (pratique générale) »; ends the text with a server-built
      « sources : … » line for the mobile app
- [x] A3. Tests: `AnswerCitationsTest` (7) + `AskGeneralAssistantTest` (11, 5 new: citations, order, template copy,
      mixed answer, numbering): 18/18
- [x] A4. `AskChat.jsx`: chips from `sources`, each opens its document (`/api/v1/files/id/{id}?inline=true`); amber
      « Pratique générale » chip; the closing line taken off; an older server's line still read
- [x] A5. Check (2026-11-24): `mvn test` 96 run, all pass but `BackendApplicationTests` (needs Docker's `postgres`
      host, as before); `vite build` OK. Live, as the technician: « quelle huile pour les roulements » (OTW task) →
      excerpts 1, 5, 8 cited, chips OTW.pdf + HDX.pdf; « consignation… » → no source, « Pratique générale ». The
      first answer also takes the oil-change interval from HDX.pdf (PHB2's) without a label: part C's job

### B. Manuals linked to models (needs questions 1 and 2)

- [x] B0. `specs/specs_<MODEL>.txt` (2026-11-24, now in `backend/src/main/resources/specs/`): the PFA report's section 2.4 split into one sheet per model
      (OTW, OTC, OTS, PHB2, PHB3, PHH), wording and figures as written, every figure checked against the report;
      each under 400 words, so one chunk. Fields the source doesn't give are listed « à compléter par PHOVA »
      (vitesse de rotation for OTW / OTC / OTS). Added, not from the report: the note that « jusqu’à » values are the
      series maximum (a given pump's value is on its nameplate), and the « à compléter » lines: to check before upload.
- [x] B0b. ~~Upload the six sheets by hand~~: done by the app instead (B10–B13, §7), titled « Fiche technique <MODEL> »,
      linked `SPEC`, editable by the admin afterwards.
- [x] B0c. (Done 2026-11-24, local library, asked: deleted AHLSTAR.pdf, OTW.pdf, HDX.pdf, rapport_pfa_phova.pdf and
      AHLSTAR_CC_IOM_ISO_EN; the manuals are to be uploaded again with their ticks.; then the 43 old test uploads (Docker books,
      employee CSVs and their 11 analyses, cover letters, CV, summonses, README, test_doc) — kept: the 4 « Checklist
      meuleuse » PDFs, the « CR_Reunion… » minutes, « HELP » (no readable text). Uploaded with ticks: AHLSTAR and
      AHLSTAR CC → OTW, MBN and MBN RO → PHB3, ZPP horizontal → PHB2, all COMPARABLE.) Remove `rapport_pfa_phova.pdf` from the library once B10 has installed the sheets, or its PHH line keeps reaching other pumps'
      answers. That also removes its general part (ISO 10816 vibration tables, used by baseline Q2, and the
      vibration-analysis chapters): decide whether to extract that part into a general document first.
- [x] B0d. (Note) Until part C, a spec question brings back all six sheets together; the model picks by the task's
      equipment. Expected, not a bug.
- [x] B1. ~~`PumpModelRepository` + one `pump_models` row per type~~: not needed, the links name the model type
      directly (`PumpModelDocument.model`); `PumpModel` keeps its rows' table, its unused `manuals` removed
- [x] B2. `PumpDocumentService`: models of files, set a file's models (spec links kept), a model's documents
      (sheet, OWN, COMPARABLE), `resolve(equipment)` (registry, then the model the code starts with); the
      general file ids wait for part C
- [x] B2b. `PumpModelDocument` entity, table `pump_model_document` (kind `SPEC` / `OWN` / `COMPARABLE`, origin, installed
      hash, changed by / at), replacing the unused `PumpModel.manuals` (§7); the admin's kind choice next to the model chip
- [x] B3. `POST /api/v1/files/upload`: optional `models` (repeatable) + `kind` (OWN / COMPARABLE), checked before
      storing; `FileResponse.FileInfo` gets `models` on every file list
- [x] B4. `PUT /api/admin/files/{id}/models` (ADMIN through `SecurityConfig`'s `/api/admin/**` rule), 404 for an
      unknown file
- [x] B5. Tests: `PumpDocumentServiceTest` (9: tick, untick, kind change, spec links kept, names, order, resolve).
      The admin-only rule is checked by hand on the running stack (no MockMvc / spring-security-test here): see B9
- [x] B6. `UploadPage.jsx`: model ticks + « document PHOVA / pompe comparable » (`PumpDocumentControls.jsx`)
- [x] B7. « Documents » (`FilesList.jsx`): model chips per file (« Documentation générale » when none), admin
      « Modèles » button to change them
- [x] B8. ~~One-off SQL tagging~~: the admin ticks the existing documents on « Documents » (asked 2026-11-24)
- [x] B9. Check (2026-11-24, local stack restarted): the six sheets installed at startup (one excerpt each), read
      endpoints 200 for the technician, both admin endpoints 403 for him, unknown model 400, `resolve` PHB3-J-07 →
      PHB3, OTC125-45 → OTC, P-101 → none; every changed module compiles in Vite; `server_db_check.sql` 0 rows.
      Admin side, same day (local admin account): 16/16 — tick / change kind / untick a test document (« Documents »
      list and pump page follow), unknown model 400, unknown file 404, SPEC not tickable; « Modifier » makes a new
      version (old file, excerpts and link gone, new one embedded), « Remplacer » with a file, empty text 400.
      The OTW sheet was then deleted and reinstalled by a restart (the « missing sheet » path). Screens themselves
      not clicked through in a browser
- [x] B10. (`specs/` already moved to `backend/src/main/resources/specs/`, 2026-11-24.) Startup installer: one « Fiche technique <MODEL> »
      per model with a bundled sheet and no `SPEC` link, ingested, linked `SPEC`, origin `INSTALLED` + hash; reinstall
      only if `INSTALLED` and the bundled hash changed; failures logged, retried at the next start
- [x] B11. Read: `GET /api/v1/specs`, `GET /api/v1/specs/{model}`, `GET /api/v1/pump-models/{model}/documents` (any logged-in user). Edit: `/api/admin/specs`: edit
      text, replace by upload, add (new document, re-ingested, relinked, old document and chunks deleted; origin `ADMIN`)
- [x] B12. Frontend « Fiches techniques » page (`/fiches`, `roleTabs.js`: ADMIN, MANAGER, USER, WORKSHOP_LEAD,
      PROJECT_LEAD, « Documentation » group): one card per model, characteristics table, missing values shown;
      ADMIN only: « Modifier » (text area), « Remplacer », « Ajouter »; everyone: « Télécharger »
- [x] B12b. Pump page (`Pumps.jsx`): « Fiche » tab = registry record + « Fiche technique <MODEL> » (`SpecSheetCard`),
      also for an unregistered pump; « Documentation » tab (`PumpPanels.jsx`) from
      `GET /api/v1/pump-models/{model}/documents` with each document's kind, no more file-name search
- [x] B12c. « Fiche technique <MODEL> » row on the task's « Détails » tab, linking to `/fiches?modele=<MODEL>`
- [x] B13. `SpecSheetServiceTest` (9) — Tests: install is idempotent (two starts, six sheets); never overwrites an `ADMIN` sheet; a changed bundle
      reinstalls an untouched one; edit replaces the chunks; read endpoints 200 for a technician; edit endpoints admin
      200, technician 403
- [x] B14. `SERVER_SETUP.md` (+ the new enums in `forms/server_db_check.sql`): the sheets are installed at first start, edited on « Fiches techniques »; optional drop of
      the empty `pump_model_manuals` in `init-server.sh`

### C. The chat takes the pump from the context (decided 2026-11-24: HDX removed, general documents included, `/ask` picker)

- [x] C0. HDX removed from `PumpType`: the simulated fleet's 4 HDX pumps are PHB2 now (same numbers, PHB2-S-08…),
      `forms/server_db_check.sql` lists updated, `scripts/hdx_removed.sql` (idempotent: a registered HDX pump's model
      → not known yet, the simulated HDX alerts' codes → PHB2, old rows deleted) run by `init-server.sh` step 7c and
      once on the local database (alert #3 HDX-S-08 → PHB2-S-08)
- [x] C1. `AskRequest`: optional `pumpModel` (three-field constructor kept)
- [x] C2. `AskService` prompt 2.3: `PumpDocumentService.resolveFor` (chosen model → registry → code prefix → none) →
      scope (`MANUALS` when OWN / COMPARABLE documents are ticked, else `NO_MANUAL`; `NO_MODEL`) → search
      (`findSimilarChunksForModel`: the model's documents + the general ones; else the whole library); « Modèle de la
      pompe » line in the user prompt; `AiResponse` and `AskInteraction` get `scope`, `pumpModel`, `warnings`
- [x] C2b. The model's spec sheet always first (`findChunksOfFile`), once
- [x] C3. Tests: `AskSharedDocumentsTest` (disabled, about the commented-out pump-name code) deleted; `AskPumpContextTest`
      (8: scopes, sheet first, chosen model, labels), `AnswerFiguresTest` (6), `AskGeneralAssistantTest` updated
- [x] C3b. Excerpt headers say what each document is to the model (fiche technique PHOVA / document PHOVA / manuel
      d'une pompe comparable / documentation d'un autre modèle / documentation générale); sources carry `kind` + `models`
- [x] C3c. `AnswerFigures`: figures = a number with a unit, or a decimal (counts aren't checked); found only in a
      COMPARABLE / OTHER excerpt → warning with that document; found nowhere → UNDOCUMENTED; a cited comparable or other
      document is labelled even without a figure; warnings saved as JSON with the interaction
- [x] C4. `AskChat.jsx`: notice for `NO_MANUAL` / `NO_MODEL`, amber warnings block, « · pompe comparable » / « · PHB3 »
      on the source chips, `pumpModel` prop
- [x] C5. `/ask` (`Ask.jsx`): « Pompe : Non précisée · OTW · … » picker, kept on the device
- [x] C6. Check (2026-11-24): `mvn test` 104 run, all pass but `BackendApplicationTests` (Docker's `postgres` host);
      lint and `vite build` OK. Live, one question per case: OTW task → AHLSTAR « pompe comparable » + its figures
      labelled; PHB3 task → MBN RO only, its 30 % labelled; OTC task → its sheet first, speed « not documented » (the
      sheet says « à compléter »), notice; `/ask` no pump → MBN RO clearances labelled « modèle PHB3 »; `/ask` PHB2 →
      450 °C from its sheet, no label

- [x] C7. (2026-11-24, seen while capturing the presentation) An excerpt of another model now says what it is to that
      model in its header and its label: « manuel d'une pompe comparable au modèle PHB3 » rather than « documentation du
      modèle PHB3 » (`AiResponse.Warning.linkKind`), so a comparable manual's 180 °C no longer reads as the PHB3's.
      `AskChat.jsx` scrolls only its message list: scrolling the window hid the pump picker on « Assistant ».

### D. After, and both deployments

- [x] D1. Same questions as step 0 (2026-11-24, new library: 5 manuals + 6 spec sheets; run after A+B and after C).
      After C: placeholder sources 9 → 0; another pump's value given without a label 7 → 0 (a known pump only reads its own
      documents, comparable ones labelled); figures in no document 2 → 0; Q2 now quotes AHLSTAR's limits, Q35 « not
      documented », Q36 200 °C from the OTW sheet. Still weak: breakdown diagnosis (Q14, Q16). Found and fixed on the way:
      excerpts of a document deleted while being embedded (orphans, « unknown » source). The library changed since the baseline (six spec sheets
      added, PFA report removed, maybe the OTW.pdf copy deleted): note it in the comparison, and if needed re-run the
      baseline on the new library with the old code to tell the documents' effect from the code's
- [x] D2. Same changes in `~/Desktop/documind-rapports` (branch `rapports`), 2026-11-25: see that folder's
      `plan_rapports_new_changes.md`. Adapted: no pump registry there, so an equipment's model comes from its code only
      (`PumpDocumentService.resolve`); equipment stays optional on the task page; « Fiches techniques » for its three
      roles; `hdx_removed.sql` skips the registry's `pump` table when it doesn't exist. Not taken: the pump page's tabs
      (`Pumps.jsx`, `PumpPanels.jsx`: the pumps are hidden there)
- [x] D3. `mvn test`, `vite build` (also `VITE_EDITION=rapports`), eslint, in both folders. Rapports (2026-11-25): 99 run,
      all pass but `BackendApplicationTests` (no database outside Docker); both builds OK; eslint: no new problem (SearchPage's
      4 and UploadPage's 1 are older). Test: see `plan_three_fixes.md`'s checks (112 run, same single error)
- [ ] D4. Server: the new table comes from `ddl-auto`, the sheets are installed by the app at first start, the enums are in `forms/server_db_check.sql` (B14); step 7c of `init-server.sh` runs `scripts/hdx_removed.sql`. After deploy, the admin ticks the existing documents and removes the PFA report (B0c)

## Open questions

1. ~~`HDX` is in `PumpType`~~: removed 2026-11-24 (C0).
2. ~~Do the competitor manuals count as a model's manual?~~ Replaced by question 9. AHLSTAR → OTW and HDX → PHB2 give those two
   models the `MANUALS` mode. Leaving them untagged keeps every question in the general mode until PHOVA's own
   manuals are uploaded. Either way it's a tick on « Documents ».
3. ~~General documents in `MANUALS` mode~~: included (2026-11-24).
4. ~~`/ask` page~~: picker added (C5).
5. ~~The mobile app~~: the server keeps writing a « sources : » line, built from the citations (part A).

6. ~~`NO_MANUAL` scope~~: answered 2026-11-24, whole library with server labels (§6).
7. ~~The PFA report~~: answered 2026-11-24, split into `specs/` (step B0), then out of the assistant.
8. ~~Spec sheets~~: answered 2026-11-24, one `.txt` per model, installed by the app, linked `SPEC`, shown to everyone, edited by the admin (§7).
9. ~~Competitor manuals as `COMPARABLE`~~: done on upload (2026-11-24), see `manuals_pump_choice.md`: AHLSTAR and
   AHLSTAR CC → OTW, MBN and MBN RO → PHB3, ZPP horizontal → PHB2.

## Noticed, then fixed (2026-11-24, asked)

- Writing to the shared library was open to any logged-in user through the API: `POST /api/v1/files/upload`,
  `POST /api/v1/files/scan`, `DELETE /api/v1/files/delete/id/{id}` and `/delete/{name}` (which deletes every file
  whose name contains {name}). Now ADMIN only, in `SecurityConfig`. Nothing visible breaks: « Importer » and the
  mobile app's upload tab are the admin's; the data viewer (`/data-visualisor`, which uploads CSVs) has no link
  (`showVisualize = false`) and would now need an admin.

## Noticed, not fixed

- The data visualiser's chat sends `fileId` (« ask about this file »), but no live code reads it since the
  Phova version: it searches the whole library. Its only use is in the commented-out code of `answerWithAiRag`.

## Before / after

| Question | Asked from | Before (2.1) | After |
|---|---|---|---|
| 1. tous les combien vidanger l'huile du palier ? | task PHB2-S-06 | 🟡 right figure, broken sources, an AHLSTAR excerpt in a PHB2 answer | |
| 2. vibration max admissible ? | task OTW-JORF-01 | 🟡 grounded, but the PHOVA report's ISO table instead of the manual's own limits | |
| 3. la garniture fuit goutte a goutte au demarrage je fais quoi | task PHB3-J-07 | 🟡 plausible list, one item wrong for a mechanical seal | |
| 4. comment regler le jeu entre la roue et la plaque d'usure | task PHB3-J-07 | 🟢 sound procedure, right instrument, no figure | |
| 5. couple de serrage des boulons de la volute ? | task OTC125-45 | 🟢 no figure invented, says where to find it | |
| 6. roue corrodee sur les aubes je le mets ou dans le rapport ? | task PHB3-J-07 | 🟢 exact place in the expertise report, comment template with blanks | |
| 7. consignation avant demontage pompe acide phosphorique | /ask | 🟢 complete safety sequence | |
| 8. roulement chauffe cote accouplement | /ask | 🔴 invented a « typical » figure (70 °C), broken sources | |
| 9. quelle est la capitale de la France ? | /ask | 🟢 off-topic → null | |
| 10. pompe o t w pression eau de barrage garniture | /ask | 🔴 answers the max service pressure, not the sealing water pressure | |
| 11. la pompe ne debite plus apres le redemarrage | task PHB3-J-07 | 🟡 usable list, misses the valves and the rotation direction | |
| 12. bruit de cailloux dans la pompe c'est de la cavitation ? | task OTW-JORF-01 | 🟡 sound answer, placeholder sources | |
| 13. pression au refoulement faible alors que le moteur tourne normalement | task PHB2-S-06 | 🟢 reasonable causes and checks | |
| 14. le moteur disjoncte au demarrage de la pompe | task PHB3-J-07 | 🔴 most causes listed don't trip a motor at start | |
| 15. vibrations fortes depuis hier sur la pompe | task OTW-JORF-01 | 🟡 good causes, placeholder sources, no manual limit | |
| 16. la pompe chauffe et fait du bruit quand la vanne de refoulement est fermee | /ask | 🔴 misses the real cause: running against a closed valve | |
| 17. fuite au joint du corps de pompe | task PHB2-S-06 | 🟡 half the causes don't apply to a casing gasket | |
| 18. l'arbre ne tourne pas a la main il est bloque | task PHB3-J-07 | 🟡 two causes don't apply; misses deposits | |
| 19. la pompe se desamorce souvent | task OTC125-45 | 🟢 sound list with checks | |
| 20. intensite du moteur trop elevee | /ask | 🟡 reasonable, placeholder sources | |
| 21. l'huile du palier est laiteuse | task PHB2-S-06 | 🟡 water first is right; « oxidation makes it milky » is wrong | |
| 22. sens de rotassion inverse comment verifier | /ask | 🟡 arrow and wiring right; vibration analysis to find the direction is not a method | |
| 23. comment mesurer le faux rond de l'arbre | task PHB3-J-07 | 🟢 correct method, no figure | |
| 24. comment verifier l'alignement pompe moteur | task OTW-JORF-01 | 🔴 the PHB2 manual's tolerance given for an OTW, unattributed | |
| 25. quel est le jeu axial admissible des roulements | task PHB2-S-06 | 🔴 invented a « typical » range | |
| 26. comment savoir si la roue est usee | task OTW-JORF-01 | 🟢 usable checks | |
| 27. quels controles avant de remettre la pompe en service apres reparation | task PHB3-J-07 | 🟡 good list, another pump's manual unattributed | |
| 28. comment controler une garniture mecanique demontee | /ask | 🟡 seal face flatness isn't checked with a dial indicator | |
| 29. etapes pour demonter la roue | task OTW-JORF-01 | 🟡 right manual, right steps, placeholder sources | |
| 30. comment remplacer les roulements du palier | task PHB2-S-06 | 🔴 PHB2 asked, the OTW's procedure given | |
| 31. quelle graisse ou quelle huile pour les roulements | task OTW-JORF-01 | 🟡 right oil from the right manual, extras of unclear origin | |
| 32. quelle quantite d'huile dans le palier | task PHB2-S-06 | 🟡 exact figures from the right manual, placeholder source | |
| 33. montage des roulements a contact oblique dos a dos ou face a face | /ask | 🟡 correct principle (back to back), placeholder sources | |
| 34. combien de fuite on laisse sur un presse etoupe a tresse | /ask | 🟡 says « not documented », but the OTW's manual has it | |
| 35. vitesse de rotation maximale de la pompe | task OTW-JORF-01 | 🔴 the PHH's speed given as the OTW's, wrong source | |
| 36. temperature maximale du liquide pompe | task OTW-JORF-01 | 🔴 the PHB2 manual's ATEX table read as the OTW's max temperature | |
| 37. c'est quoi le NPSH et comment eviter la cavitation | /ask | 🟡 correct explanation, garbled terms, placeholder sources | |
| 38. what is the minimum continuous flow for this pump | task PHB2-S-06 | 🟡 right content, wrong language | |
| 39. difference entre rapport d'expertise et rapport d'assemblage | /ask | 🟢 correct, never mixes the two reports | |
| 40. une mesure hors tolerance dans le controle de montage je mets quoi | task PHB3-J-07 | 🟡 Non conforme and comment right; recommendations don't belong there | |

Before: 10 good, 21 partial, 9 wrong. Details and counts per problem in `ask_baseline_2026-11-24.md`.
