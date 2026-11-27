# Plan: a general technician assistant (24 November 2026)

PHOVA has no repair manuals for its own pumps yet, so the pump-specific assistant (PHOVA name → competitor
manual: OTW → AHLSTAR, …) answers little. First a **general** version; the specific one comes back once
PHOVA's own documentation is in the library.

## What changes

- `AskService.answerPhovaWithAiRag`: the whole PHOVA ↔ competitor aliasing method is **commented out**, not
  deleted (it is the starting point of the specific version).
- New `AskService.answerGeneralWithAiRag`, which `/api/v1/ask` now calls:
  - the question is embedded as typed; retrieval over the **whole shared library** (`findSimilarSharedChunks`);
  - the task's equipment (« OTW-JORF-01 ») goes to the model as context, not into the search;
  - no multi-pump refusal; an empty library no longer gives a 404, the model answers from general practice;
  - same reply contract as before, so `AskChat.jsx` needs no change: `null` for off-topic questions, last
    lines `sources : …` and `chunks : …` (now `sources : connaissances générales` when no excerpt was used);
  - `AskInteraction` logged with promptVersion **2.1**.
- New system prompt 2.1 (French): documents first, general centrifugal-pump practice allowed but flagged,
  **no invented figures** (tolerances, torques, clearances, part codes), safety (consignation) when it matters,
  and how to fill the reports: expertise (démontage 01–07 / montage 08–11), assembly RASSN-02, control sheets
  and NC / réclamation / dérogation tickets. Assembly and expertise kept apart.

## Steps

- [x] Plan file
- [x] Comment out the aliasing method, add `answerGeneralWithAiRag` + prompt
- [x] Tests: old `AskSharedDocumentsTest` disabled (it tests the commented method), new `AskGeneralAssistantTest` (7/7)
- [x] Compile + unit tests
- [x] End to end, real OpenAI calls, through `POST /api/v1/ask` with AskChat's payload (7 questions each):
  - [x] task report filling (with the task's equipment: PHB3-J-07, OTW-JORF-01, OTC125-45)
  - [x] general assistant (no equipment)
  - [x] report platform (documind-rapports, port 8082, its own DB: empty library → answers from general practice, no 404)
- [ ] The document the user will supply: upload it to the shared library, re-run the e2e questions
- [ ] Click-through in the browser (only the API was exercised)

## E2E results (24 November 2026)

Prompt 2.0 failed two of seven: it invented a clearance range (« 0,1 à 0,3 mm ») with the wrong instrument
(pied à coulisse), and for corrosion on an impeller it gave no report section, invented the extent and spoke of
« non-conformité » on an expertise inspection page. Prompt 2.1 (no « typical » values or ranges, the right
instruments, a 4-step report-filling order with [à compléter] blanks, conformity only for checks) passes all
seven on both stacks: the clearance question says the value is not documented, names the feeler gauges and
where to find the tolerance; the corrosion question gives « Rapport d'expertise, 03 Inspection des pièces, page
Roue », the box to tick, a template with blanks and the three recommendations; off-topic gives `null`.

## Found, not fixed (waiting for approval)

- The "shared library" is every file in the database: on the documind DB it holds 6 copies of a Docker book,
  CVs, cover letters, « employees », a convocation. They compete with the pump documents in retrieval and their
  names can appear as sources to a technician. Proposal: only search files uploaded by ADMIN / MANAGER, or add
  a « documentation » flag on upload.

## No server step

Code only: no table, env variable or seed data, so nothing for `scripts/init-server.sh`.
