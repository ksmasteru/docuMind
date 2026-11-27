# Plan: the report platform runs without `analysis-service`

Asked on 2026-11-25: « remove analysis service from the rapport project, it is useless ». It came up because its
image failed to build on the server (pip timed out downloading pandas/numpy/matplotlib from PyPI).

## What the service did

Only for an uploaded `.csv`, `.xls` or `.xlsx`:
1. turned the table into text (row/column counts, column statistics) so the Assistant could search it;
2. drew charts for the `/data-visualisor` page, which has no link anywhere (`showVisualize = false` in `Layout.jsx`,
   not in `RAPPORTS_TABS`).

On the platform only the admin imports, and what gets imported is pump manuals (PDF). So neither is used.

## Decisions

- **Out of the stack:** the `analysis-service` service leaves `docker-compose.server.yml` and `docker-compose.yml`;
  `ANALYSIS_HOST` leaves `.env.server.example`. `analysis.service.url` has a default in `application.properties`,
  so a server `.env` that still sets it, or doesn't, both start fine.
- **Spreadsheets refused on the platform** instead of failing silently: with `APP_EDITION=rapports`,
  `DocumentService.uploadFile` answers « type not supported » for CSV/Excel (before this, ingestion would catch the
  connection error and leave a document with no excerpts the Assistant could find). « Importer » offers PDF, TXT
  and MD only. The full platform is unchanged.
- **Code kept:** `analysis-service/`, `AnalysisServiceClient`, `DataAnalysisService`, the visualiser stay, so this
  branch is still the same code as `test`. (The pip timeout/retry change made earlier today in
  `analysis-service/dockerfile` stays too: it's identical in `~/Desktop/documind`.)
- **Server:** `init-server.sh` step 2 starts the stack with `--remove-orphans`, so the next
  `git pull && ./scripts/init-server.sh` also removes the old `analysis-service` container. Volumes are not touched.

## Steps

- [x] Plan file
- [x] Compose files and `.env.server.example`
- [x] Backend: `DocumentService` refuses CSV/Excel on the platform (400, message shown on « Importer », also for a
      file dropped on the zone); `DocumentServiceEditionTest`, 4 tests, both editions
- [x] Web: `UploadPage.jsx`, accepted types and the hint under the drop zone
- [x] Server: `init-server.sh` step 2 `--remove-orphans`; `SERVER_SETUP.md`
- [x] Checks (2026-11-25): `./mvnw test` 114 run, all pass but `BackendApplicationTests` (needs Docker's `postgres`
      host, as before); `docker compose config --services` on both files: no `analysis-service`; `bash -n
      init-server.sh` OK; `vite build` with `VITE_EDITION=rapports` OK; eslint on `UploadPage.jsx`: nothing new
      (the unused `Link` was already there)
- [ ] On the server: `git pull && ./scripts/init-server.sh`, then `docker ps` shows no `analysis-service`, and
      « Importer » refuses a `.csv`

## Merging later

To join by hand when `test` and `rapports` meet: `docker-compose.server.yml` and `docker-compose.yml` (the full
platform still runs `analysis-service`), `.env.server.example`, `DocumentService.java`, `UploadPage.jsx`,
`init-server.sh`, `SERVER_SETUP.md`.
