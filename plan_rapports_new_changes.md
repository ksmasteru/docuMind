# Plan: the new changes of `test` that apply to the report platform

Asked on 2026-11-25: « apply to the report platform the applicable new changes ». The report platform is this
folder (`~/Desktop/documind-rapports`, branch `rapports`, `APP_EDITION=rapports`); the new changes are the ones
made in `~/Desktop/documind` (branch `test`, uncommitted) since this branch was cut on 2026-11-23.

Already here before today (done in both folders on 2026-11-24): the general assistant (`plan_general_assistant.md`),
the chat in a task's « Ask » tab (`plan_report_chat.md`). Only here: the « Tableau de bord » (`plan_report_stats.md`).

## What applies, what doesn't

| Change on `test` | Here? | Why |
|---|---|---|
| Pump manuals, parts A–C (`plan_pump_manuals.md`): sources built by the server, documents ticked per model, spec sheets, the chat takes the pump from the context, HDX removed | **yes**, step D2 of that plan | Documents, Importer and Assistant are on the platform |
| Fix: the « Documents » search lagged one character (`plan_three_fixes.md` #2, on `test`) | **yes** | « Documents » is on the platform |
| Fix: blank page before « 03 – Contrôles dimensionnels » in the PDF (#3) | **yes**, only the page-break rules | the v2 expertise reports are on the platform |
| Fix: a manager assigns any report (#1, `?assign=true`) | no | already here since 2026-11-23, its own way (`?for=task`, `AssignAnyReportTest`) |
| No « Formulaires » for the manager (`plan_manager_forms_tab.md`, on `test`) | no | the platform's manager already has none (`RAPPORTS_TABS`); it only changes the full platform |
| Notifications, clients and pumps registry, stock, signatures (2026-11-21) | no | not on the platform (decisions of 2026-11-23); the signature rules in `parts.html` are left out too |
| The pump page's « Fiche » and « Documentation » tabs (`Pumps.jsx`, `PumpPanels.jsx`) | no | the pumps are hidden here |
| `scripts/ask_baseline.py` | no | a measuring tool for the local stack, not part of the app |

## Adapted for the platform

- **No pump registry here** (`Pump`, `PumpRepository` belong to the 2026-11-21 work): `PumpDocumentService.resolve`
  goes chosen model → the model the equipment's code starts with (« OTW-JORF-01 ») → none. An equipment left blank
  (it is optional here) gives « Pompe non précisée ». `PumpDocumentServiceTest` loses its registry case.
- **Equipment stays optional** on the task page: the « Fiche technique <MODEL> » row only shows when the equipment
  names a model.
- **« Fiches techniques »** for the platform's three roles (admin, manager, technician), in « Documentation ».
  `/api/v1/specs` and `/api/v1/pump-models` aren't under the hidden `/api/v1/pumps`, so `EditionFilter` lets them through.
- **`scripts/hdx_removed.sql`**: the line on the registry's `pump` table only runs when that table exists (here it
  never does); `init-server.sh` runs it at step 7c as on `test`.
- `SERVER_SETUP.md`: the pump documents section without the registry and « Équipements ».

## Steps

- [x] Plan file
- [x] Backend, copied from `test` (rapports had none of their own changes in them): `AiResponse`, `AskInteraction`,
      `AskRequest`, `FileResponse`, `PumpModel`, `PumpModelDocument`, `PumpDocumentViews`, enums `PumpType` (no HDX),
      `DocumentKind`, `LinkOrigin`, `AskScope`; `ChunkRepository`, `PumpModelDocumentRepository`; `AskService`,
      `AnswerCitations`, `AnswerFigures`, `DocumentService`, `IngestionService`, `SpecSheetService`;
      `DocumentController`, `AdminDocumentController`, `PumpDocumentController`; `SecurityConfig` (library written by
      the admin only); `resources/specs/specs_<MODEL>.txt`
- [x] Backend, adapted: `PumpDocumentService` (no registry); `RecordNotFoundException` + its 404 in
      `GlobalExceptionHandler` (only that handler, not the stock / signature ones)
- [x] Tests: `AnswerCitationsTest`, `AnswerFiguresTest`, `SpecSheetServiceTest`, `AskPumpContextTest`,
      `AskGeneralAssistantTest` (copied), `PumpDocumentServiceTest` (no registry case); `AskSharedDocumentsTest`
      removed, as on `test` (C3: disabled, it tested the commented-out pump-name code)
- [x] Web, copied: `SpecSheets.jsx`, `SpecSheetCard.jsx`, `PumpDocumentControls.jsx`, `pumpDocuments.js`,
      `specSheet.js`, `FilesList.jsx`, `UploadPage.jsx`, `Ask.jsx`, `AskChat.jsx`, `SearchPage.jsx`, `pumpStates.js`,
      `fleetSimulator.js` (HDX pumps → PHB2, the full platform's twin)
- [x] Web, adapted: `TaskScreen.jsx` (sheet row, equipment optional), `roleTabs.js` (« Fiches techniques »),
      `App.jsx` (`/fiches`)
- [x] PDF: `expertise/parts.html`, the blank-page rules only
- [x] Server: `scripts/hdx_removed.sql`, `init-server.sh` step 7c, `forms/server_db_check.sql`, `SERVER_SETUP.md`
- [x] Checks (2026-11-25): `./mvnw test` 99 run, all pass but `BackendApplicationTests` (needs Docker's `postgres`
      host, as before); new here: `PumpDocumentServiceTest` 8, `AskPumpContextTest` 9, `SpecSheetServiceTest` 9,
      `AnswerCitationsTest` 7, `AnswerFiguresTest` 6, `AskGeneralAssistantTest` 11; `vite build` OK, full and
      `VITE_EDITION=rapports`; eslint on the 15 changed web files: nothing new (SearchPage's 4 and UploadPage's 1
      errors were already there; SearchPage's missing-dependency warning is gone)
- [x] D2 / D3 ticked in `plan_pump_manuals.md` (copied here, so the links in the code and `SERVER_SETUP.md` resolve)
- [ ] On a running report stack (not done: no stack running, no `.env` in this folder): the six sheets installed at
      start, « Fiches techniques » for the three roles, a model ticked on « Importer », a task with « OTW-… » and one
      with no equipment asked from « Ask », `/api/v1/pump-models` and `/api/v1/specs` not refused by `EditionFilter`

## Merging later

Files now changed on both branches in different ways (to join by hand when `test` and `rapports` meet):
`PumpDocumentService.java` (registry), `PumpDocumentServiceTest.java`, `TaskScreen.jsx`, `roleTabs.js`, `App.jsx`,
`GlobalExceptionHandler.java`, `expertise/parts.html` (signatures), `scripts/hdx_removed.sql` (guard),
`init-server.sh`, `SERVER_SETUP.md`, `forms/server_db_check.sql` — on top of those already listed in
`plan_rapports_platform.md`.

Only here so far, to port to `test` (same bug there): « Documents » lists every document for every role
(`plan_documents_list.md`, 2026-11-26) — `DocumentService.java` (`allFiles`), `DocumentController.java`
(`GET /api/v1/files`), `SearchPage.jsx`, `DocumentServiceListTest.java`.
