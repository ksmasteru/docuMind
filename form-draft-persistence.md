# Form filling: persistent drafts

How form filling works today, and how to save a technician's partly filled form so it survives a logout.

## How it works today

```
 Manager                     Technician (InspectionForm.jsx)                      Backend / DB
 ───────                     ───────────────────────────────                      ────────────
 creates Task ─────────────► opens task (taskId, templateId)
                             │
                             ├─ GET /api/v1/forms/inspectionForm/{templateId} ──► CheckListTemplate
                             │       ◄── title, questions (CheckListItem[])          └─ CheckListItem (id, position, answerType)
                             │
                             │  React state only (lost on logout/refresh):
                             │    answers{itemId→{value,comment}}, equipment,
                             │    inspectionDate, remarks, step
                             │
                             ├─ POST /api/v1/images (each photo) ──────────────► ImageEntity (reportId = null)
                             │       ◄── { imageId }   → stored in answers
                             │
                             └─ POST /api/v1/submissions ──────────────────────► SubmissionService.validateSubmission
                                  SubmissionRequest {templateId, taskId,          ├─ strict validation (every answer present)
                                    equipment, date, remarks, answers[]}          ├─ INSERT CheckListSubmission (id = submissionId)
                                       ◄── { id: submissionId, status }           │     └─ CheckListAnswer × N (item_id, value)
                                                                                  ├─ Task → SUBMITTED, latestSubmissionId = id
                                                                                  └─ ImageEntity.reportId = submissionId
```

- **templateId (the form id)** is the blank form: a `CheckListTemplate` and its questions.
- **submissionId** is one filled copy of that form. It only exists once the form is sent, which is why nothing survives a logout before that.

## Proposed design: a separate draft table

```
FormDraft
  id          UUID
  userId      (from token)
  templateId
  taskId      (nullable)
  payload     TEXT/JSONB  ← exactly the React state: {answers, equipment, inspectionDate, remarks, step}
  updatedAt
  UNIQUE (userId, templateId, taskId)   → one draft per technician per form/task
```

```
 open form ──► GET  /api/v1/drafts?templateId=…&taskId=…   ── 200 payload → fill the form state
                                                           ── 404 → blank form
 any change ─► PUT  /api/v1/drafts  (debounced ~1.5 s)     ── upsert by (userId, templateId, taskId)
 send ───────► POST /api/v1/submissions                    ── same transaction: delete the draft
```

how does it know which fields have ben filled ? 
  field1 : ---.
  field2 : ---.
  field3 : ---.

save the changes after a page has been filled(and checked for error) this should happend on the suivant entirely :

when sending delete the draft : good.

### Why not reuse `CheckListSubmission` with the `DRAFT` status

`SubmissionStatus.DRAFT` already exists ("later: saved but not sent"), but using it would mean changing several things that assume a submission is finished:

- `equipment` can't be null in the database, but a draft may not have one yet.
- `submittedAt` is stamped automatically when the row is first saved and can't be updated, so it would record when the draft started, not when it was sent.
- Validation requires every answer, so it would need a lenient mode for partial forms.
- The photo check refuses an image that already has a `reportId`, so it would block the draft's own photos on each re-save.
- `getReport`, the PDF and the manager's review views would all have to filter drafts out.

A JSON draft table avoids all of that, and the strict validation still runs once, at send time.

## Implementation steps

### Backend

1. Add a `FormDraft` entity and repository, plus a `DraftController` with GET, PUT and DELETE. Take the user from `authentication.getName()`, as `SubmissionController` already does.
2. In `SubmissionService.validateSubmission`, delete the matching draft after the save. It runs in the same transaction, so a refused submission keeps its draft.
3. Cap the payload size, for example 256 KB. Only image ids go in the payload, never the photos themselves.

### Frontend (`InspectionForm.jsx`)

1. After the template loads, GET the draft and fill `answers`, `equipment`, `inspectionDate`, `remarks` and `step` from it.
2. Add a `useEffect` on those values that PUTs the draft after about 1.5 s without changes. Skip it while the draft is still loading, or the blank form will overwrite the saved one.
3. Show a small "Brouillon enregistré à 14:32" note so the technician can see it's saved.
4. Optionally, also mirror the draft in `localStorage` so it survives a dropped connection on site, and sync it when the connection returns.

### Photos

These already fit. Each one is uploaded as soon as it's picked and gets an `imageId` while its `reportId` is still null. The draft just keeps the ids, and the photos get linked to the submission when it's sent.

The one new problem is an abandoned draft, which leaves photos linked to nothing. A nightly cleanup that deletes unlinked images older than N days handles it.

## Open decisions

- **Returned tasks:** when a manager returns a task, should the new round start from the last submission's answers? A draft could be created from `latestSubmissionId`.
- **Several devices:** "last save wins" is probably fine. If not, send `updatedAt` with each save and reject one based on an older copy.
