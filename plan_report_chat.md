# Plan: the assistant chat while filling a report (« Ask » tab of a task)

Asked on 2026-11-24: make the AI chat work in the report-filling section, on documind (branch `test`)
and on the report platform (branch `rapports`, folder `~/Desktop/documind-rapports`). The chat files are
the same on `main`, `test` and `rapports`, so the same change goes into both folders.

## What was wrong

The task screen (`/tasks/:id`, tabs Détails · Ask · Rapport) has an « Ask » tab with the RAG chat
(`AskChat.jsx` → `POST /api/v1/ask`). It did not work for a technician:

1. **It only searched the asker's own uploads.** `AskService.answerPhovaWithAiRag` finds the pump's files
   across everyone's uploads (`documentService.searchFile`, no owner filter), then asks the database for chunks
   `WHERE user_email = <the asker>`. The manuals are uploaded by the admin or a manager (« Importer »), so for a
   technician the search came back empty every time: `404 no relevant document chunks for this question`,
   shown in English in a red box. The « Documents » page already shows every upload to everyone, so the chat
   was the only place the library was private.
2. **It didn't know the task's pump.** « Une question sur OTW-12 ? » was the title, but the question went
   alone: « quel couple de serrage pour la volute ? » searched every manual, so the answer could come from
   another pump's.
3. **Its answers were raw.** « Rien trouvé » came back as the word `null`; two pumps in one question as
   « please choose one pump »; the `sources : …` line stayed in the text.

## Design decisions

- **The documentation is shared for the chat:** every chunk of every uploaded file, whoever uploaded it, as
  the « Documents » page already does. Two new queries in `ChunkRepository` (no `user_email` filter); the old
  ones stay as they are for the image question path (`/ask/image`) and `IngestionService`.
- **The task's equipment goes with the question** (`AskRequest.equipment`, optional; the mobile app and
  `/ask` page don't send it and behave as before). Used only when the question itself names no pump model:
  - a model found in the equipment (OTW, OTC, OTS, PHB2, PHB3, PHH, same list as the question) picks that
    pump's manuals, as if the technician had named it;
  - if that pump has no manual, the whole library is searched instead (he didn't name the pump himself, so a
    refusal would be wrong). A pump named in the question keeps today's rule: only its own files.
  - an equipment that names no model (« P-101 », blank on the report platform) changes nothing.
- **What the technician sees:**
  - `null` → « Je n'ai rien trouvé dans la documentation sur ce point. Reformulez, ou précisez la pompe. »
  - nothing in the library for that pump (404) → « Aucun document ne permet de répondre… » as the
    assistant's reply, not a red error;
  - two pumps → « Plusieurs pompes sont citées : posez la question pour une seule à la fois. » (French on
    the server too, since that string is the answer itself);
  - the `sources : a, b` line → a « Sources » row of file chips under the answer.
- Each question still stands alone (no conversation memory): not asked for, and the cache keys on the
  question.

## Steps

- [x] backend `ChunkRepository`: `findSimilarSharedChunks`, `findSimilarSharedChunksInFiles`
- [x] backend `AskRequest`: optional `equipment`
- [x] backend `AskService`: shared queries, pump from the equipment with fallback, French « plusieurs pompes »
- [x] backend test `AskSharedDocumentsTest` (mocks, no database, no OpenAI)
- [x] frontend `AskChat.jsx`: `equipment` prop, `null` / 404 / sources shown as above
- [x] frontend `TaskScreen.jsx`: pass the task's equipment
- [x] same change in `~/Desktop/documind-rapports` (branch `rapports`)
- [x] `mvn test` and `vite build` in both folders (2026-11-24): `AskSharedDocumentsTest` 6/6; every other test passes
      except `BackendApplicationTests`, which needs Docker's `postgres` host (no database reachable outside Docker);
      both builds, the rapports one also with `VITE_EDITION=rapports`; eslint clean
- [ ] end to end on the local report stack: not done yet. It needs the backend on :8080 restarted with this code
      (it runs from `documind-rapports/backend/target/classes`), a manual imported as the admin, then a question
      asked as the technician from a task's « Ask » tab. I don't have the test accounts' passwords.

No server step: no new table, column or setting (`ddl-auto` untouched, no env var), so `init-server.sh`
doesn't change.

## Files

- `backend/src/main/java/com/docuMind/backend/Repository/ChunkRepository.java`
- `backend/src/main/java/com/docuMind/backend/model/AskRequest.java`
- `backend/src/main/java/com/docuMind/backend/Services/AskService.java`
- `backend/src/test/java/com/docuMind/backend/services/AskSharedDocumentsTest.java` (new)
- `my-react-app/src/AskChat.jsx`
- `my-react-app/src/TaskScreen.jsx`

## Open questions

- Should the chat also open from the Formulaires page, while a technician fills a report he started himself
  (the report platform's usual case)? Today it lives only in a task's « Ask » tab and on « Assistant ».
