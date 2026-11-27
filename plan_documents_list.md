# Plan: « Documents » lists every uploaded document, for every role

Asked on 2026-11-26: « no role can see uploaded documents […] when a document is uploaded it should be reachable
by everyone ».

## What was wrong

- The backend was not the problem: tested on the local stack, a document the admin uploads is found by the
  admin, the manager and the technician (`GET /api/v1/files/{name}` → 200, same result for the three).
- The page was: « Documents » (`SearchPage.jsx`) shows **nothing until something is typed**, and only what
  matches the typed text. Nobody sees what the library holds; a document is only reachable if you guess its name.
- A search with no match showed nothing either: the page tested `results.length === 0` on an object
  (`{files, filesCount}`), which is never true, so the « no match » message never appeared.
- There is no endpoint that returns every document: only search by name and « the files of user X ».

## Decisions

- **New endpoint `GET /api/v1/files`**: every document, sorted by name (ignoring case). Open to every signed-in
  role, like the search (`anyRequest().authenticated()`); upload and delete stay admin-only.
- **The page loads the list when it opens**, then the box filters it as you type, by name, ignoring case and
  accents. No request per keystroke: the library is a few dozen manuals and spec sheets.
- The spec sheets (« Fiche technique OTW »…) are documents too: they are listed, with their model chip.
- The page's own text in French, like the rest of the platform (it was the last page in English).
- Not behind `APP_EDITION`: the full platform has the same bug and the same fix (to port to `test`, see the end).
- No server step: no table or column changes, nothing for `init-server.sh`.

## Steps

- [x] backend: `DocumentService.allFiles()` (sorted by name) + `GET /api/v1/files` in `DocumentController`
- [x] test: `DocumentServiceListTest` (every file returned, sorted, whoever uploaded it)
- [x] web: `SearchPage.jsx` loads the list, filters it locally, messages for loading / error / empty / no match
- [x] check: backend tests, restart the backend, `GET /api/v1/files` as admin, manager, technician
- [x] check: `npm run build` (the production build served with ngrok)
- [x] `plan_rapports_new_changes.md`: the files to port to `test`

## Noticed, not changed (to decide)

- `FilesList.jsx` shows `file.size + "kb"`, but the size is in bytes (a 951-byte sheet shows « 951kb »).
- It shows the uploader as his e-mail, or « system » for the spec sheets.

## How it was checked (2026-11-26, local stack)

- Backend tests: `DocumentServiceListTest` (new, 2), `DocumentServiceEditionTest`, `EditionFilterTest` pass. The whole
  suite run in the `backend` container: 110 pass; the 6 errors (`FormFilesTest`, `ControlSheetTest`) read `../forms/`,
  which the container doesn't mount — not related.
- `GET /api/v1/files` as admin, manager, technician: the same 7 documents (the 6 spec sheets + a test upload by the
  admin). Without a token: 403. A technician uploading: still 403.
- In Chrome (headless), signed in as each of the three: « Documents » lists the 7 on opening; « otw FICHE » → the OTW
  sheet; « procédure » → « Procedure test upload »; « zzz » → « Aucun document ne correspond à « zzz » ». The test
  upload was deleted afterwards.
- `npm run build` passes; `eslint src/SearchPage.jsx` is clean.
- The production build served on `localhost:4173` can't sign in from a browser on the Mac: the backend's CORS allows
  `http://localhost:5173` and `FRONT_END_URL` (the ngrok address) only. Through ngrok it is fine.
