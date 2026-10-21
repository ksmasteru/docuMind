# docuMind Backend API

Every route exposed by the Spring Boot backend, with its request shape, return
type, and the JSON that actually reaches the client.

**Auth model.** `/api/auth/**` and `/actuator/**` are open; `/api/admin/**`
requires the `ADMIN` role; **everything else requires a valid bearer token**
(`Authorization: Bearer <accessToken>`). See `config/SecurityConfig.java`.

---

## `/api/auth` — AuthController

Public. Request bodies are plain `Map<String, String>`, so unknown keys are
accepted silently and missing keys arrive as `null`.

| Method | Path | Request body | Java return type |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ name, email, password }` | `ResponseEntity<?>` |
| POST | `/api/auth/register-admin` | `{ name, email, password, admin_key }` | `ResponseEntity<?>` |
| POST | `/api/auth/register_manager` | `ManagerRegisterForm` (JSON), **admin token required** | `ResponseEntity<?>` |
| POST | `/api/auth/login` | `{ email, password }` | `ResponseEntity<?>` |
| POST | `/api/auth/refresh` | `{ refreshToken }` | `ResponseEntity<?>` |
| POST | `/api/auth/logout` | `{ refreshToken }` | `ResponseEntity<?>` |

**`login` and `refresh` return `AuthResponse` on success:**

```json
{ "accessToken": "eyJ…", "refreshToken": "eyJ…", "type": "Bearer", "Role": "USER" }
```

**Status codes**

- `200` — success on all five routes
- `400` — `refresh` with a missing token; `register` / `register-admin` on a
  service failure, body `{ "error": "<message>" }`
- `401` — bad credentials on `login` (body `{ "error": "Invalid email or password" }`),
  invalid or expired token on `refresh` / `logout`, missing `admin_key` on
  `register-admin`
- `403` — wrong `admin_key` on `register-admin`

> `ResponseEntity<?>` means the success and error bodies are different shapes on
> the same route. Clients must branch on the status code before parsing.

**`register_manager`** — the exception to "public": the path is under `/api/auth`
but the method carries `@PreAuthorize("hasRole('ADMIN')")`, so it needs an admin's
bearer token. Body, validated with `@Valid` (`id` is accepted but unused):

```json
{ "name": "Manager Test", "email": "manager@test.com", "password": "Manager123!" }
```

- `200` — manager created, same body shape as `register`, with `"role": "MANAGER"`
- `400` — validation failed (blank name / password, invalid email), or
  `"Email is already registered!"` (these go through `GlobalExceptionHandler`,
  unlike the other auth routes)
- `403` — the caller is not an admin, or sent no token

---

## `/api/v1/ask` — AskController

Requires auth. The caller's identity comes from the token, never from the body.

| Method | Path | Request | Java return type |
| --- | --- | --- | --- |
| POST | `/api/v1/ask` | `AskRequest` (JSON) | `ResponseEntity<AiResponse>` |
| POST | `/api/v1/ask/image` | `image` (multipart file) | `ResponseEntity<AiResponse>` |
| POST | `/api/v1/ask/transcribe` | `audio` (multipart file) | `ResponseEntity<AiResponse>` |

**`AskRequest`**

```json
{ "question": "How do I persist data?", "fileId": "abc-123" }
```

`fileId` is optional. When present, retrieval is scoped to that one document;
when absent or blank, it searches across everything the user has uploaded.

**`AiResponse`** — the same envelope for all three routes:

```json
{
  "answer": [ { "key": "1.", "answer": "A) docker ps — …" } ],
  "askInteractionId": "3f9c…",
  "answerCount": 1
}
```

`askInteractionId` is the id of the stored question/answer row, used to attach
technician feedback. Only `POST /api/v1/ask` sets it; `/image` and `/transcribe`
return `null`.

- **`POST /api/v1/ask`** — one question, one answer. `answer` always holds a
  single element with `key` set to `"-"`, and `answerCount` is always `1`.
- **`POST /api/v1/ask/image`** — OCR extracts every question from the image, so
  `answer` holds one element per question. `key` is the question number as it
  appeared in the image, or `"-"` when the model's line carried no number.
  `answerCount` is the number of questions found.
- **`POST /api/v1/ask/transcribe`** — speech to text. The uploaded audio is
  transcribed, and the transcript comes back as a single element with `key`
  `"-"` and `answerCount` `1`. Nothing is answered; the client sends the
  transcript to `/api/v1/ask` as a normal question.

A question the documents can't answer still returns `200`, with the string
`"Not answerable from the provided documents."` as its `answer`. That's a
successful response, not an error.

**Status codes**

- `200` — answered
- `404` — `NoChunksException`: retrieval found no chunks for this user
- `502` — `NoAiResultException`: the chat model returned no result
- `500` — anything else, including a failure reading the uploaded image

---

## `/api/v1/files` — DocumentController

Requires auth.

| Method | Path | Request | Java return type |
| --- | --- | --- | --- |
| POST | `/api/v1/files/upload` | `file` (multipart), `title` (optional) | `ResponseEntity<FileResponse>` |
| POST | `/api/v1/files/scan` | `{ text }` (JSON) | `ResponseEntity<FileResponse>` |
| GET | `/api/v1/files/{name}` | path variable | `ResponseEntity<FileResponse>` |
| GET | `/api/v1/files/filter/{keyword}` | path variable | `ResponseEntity<FileResponse>` |
| GET | `/api/v1/files/user/{id}` | path variable | `ResponseEntity<FileResponse>` |
| GET | `/api/v1/files/id/{id}` | path variable | `ResponseEntity<ByteArrayResource>` |
| GET | `/api/v1/files/preview/id/{id}` | path variable | `ResponseEntity<ByteArrayResource>` |
| GET | `/api/v1/files/{fileId}/analysis` | path variable | `ResponseEntity<DataAnalysis>` |
| POST | `/api/v1/files/ask` | `Map<String, String>` | `ResponseEntity<Map<String, String>>` |
| DELETE | `/api/v1/files/delete/id/{id}` | path variable | `ResponseEntity<Void>` |
| DELETE | `/api/v1/files/delete/{name}` | path variable | `ResponseEntity<Void>` |

**`FileResponse`** — used by all four listing/search routes, even the ones that
logically return a single file:

```json
{
  "files": [ { "id": "…", "name": "notes.pdf", "size": 20481, "userId": "user@example.com" } ],
  "filesCount": 1
}
```

**`ByteArrayResource`** — raw file bytes, not JSON. `/id/{id}` is a download and
`/preview/id/{id}` is an inline preview; they differ in `Content-Disposition`.

**`DataAnalysis`** — the stored analysis for a CSV/tabular upload:

```json
{
  "id": "…", "fileId": "…", "userId": "…",
  "analysisJson": "{…}", "textSummary": "…",
  "rowCount": 1200, "colCount": 8,
  "createdAt": "2026-08-29T10:00:00Z"
}
```

`analysisJson` is a JSON **string**, not a nested object — the client has to
parse it a second time.

**`POST /api/v1/files/scan`** stores text extracted from a scanned page as a
new document owned by the caller, and returns it as a one-element `FileResponse`
with status `200`.

**Deleting.** `/delete/id/{id}` deletes by file id and is marked outdated in the
code; `/delete/{name}` deletes by file name. Both return `204`.

**`POST /api/v1/files/ask`** returns `{ "response": "…" }`. This is an older RAG
entry point that predates `/api/v1/ask`; prefer the latter for new work.

**Status codes** — `200` on success, `204` on delete, `404` via
`FileNotFoundException`, `400` via `FileNotSupportedException` for a rejected
upload type.

---

## `/api/v1/users` — UserController

Requires auth. `DELETE` additionally requires `ADMIN` via `@PreAuthorize`.

| Method | Path | Request body | Java return type |
| --- | --- | --- | --- |
| GET | `/api/v1/users` | — | `UserResponseWrapper` (unwrapped) |
| GET | `/api/v1/users/{id}` | — | `ResponseEntity<UserResponseWrapper>` |
| POST | `/api/v1/users` | `UpdateUserRequest` | `ResponseEntity<UserResponseWrapper>` |
| PUT | `/api/v1/users/{id}` | `UpdateUserRequest` | `ResponseEntity<UserResponseWrapper>` |
| DELETE | `/api/v1/users/{id}` | — | `ResponseEntity<Void>` |

**`UserResponseWrapper`** — a list envelope, used even for single-user routes:

```json
{
  "users": [ { "name": "Hicham", "email": "…", "role": "USER" } ],
  "userCount": 1
}
```

`GET /api/v1/users` returns the record directly rather than wrapped in a
`ResponseEntity`. The JSON is identical; only the Java signature differs.

**Status codes** — `200` on read and update, `201` on create, `204` on delete,
`400` with field errors when `@Valid` rejects the body.

---

## `/api/v1/forms` — CheckListController

Requires auth. Checklist templates (forms) that technicians fill in, such as the
overhead crane inspection.

> Creating forms is meant for admins only, but no role check is enforced yet:
> any authenticated user can call `POST`. See `TODO_LATER.md`.

| Method | Path | Request | Java return type |
| --- | --- | --- | --- |
| POST | `/api/v1/forms/` | `FormCreationDto` (JSON) | `ResponseEntity<Map<String, String>>` |
| GET | `/api/v1/forms/options` | — | `ResponseEntity<FormOptionsResponse>` |
| GET | `/api/v1/forms/inspectionForm/{id}` | path variable (template id) | `ResponseEntity<InspectionFormResponse>` |

**`FormCreationDto`** — validated with `@Valid`:

```json
{
  "title": "Checklist du pont roulant",
  "type": "INSPECTION",
  "instructions": "L'opérateur doit inspecter l'équipement avant de commencer les travaux…",
  "items": [
    { "labelFr": "Câble de levage", "labelAr": "كابل الرفع", "critical": true, "answerType": "BON_MAUVAIS" }
  ]
}
```

- `title`, `type` and `instructions` are required; `items` must hold at least one item.
- Each item needs `labelFr` and `answerType`; `labelAr` is optional.
- `type` is `INSPECTION` or `PERMIT`. `answerType` is `BON_MAUVAIS`, `TEXT` or `IMAGE`.
- The server sets the rest: `version` (1 for a new title, otherwise latest + 1),
  `active` (`true`), and each item's `position` (1, 2, 3… in the order sent).

Returns `201` with the new template's id:

```json
{ "id": "e40a250a-…" }
```

**`FormOptionsResponse`** — every active form, for a picker. The list key is
capitalised because the record component is named `FormItem`:

```json
{
  "FormItem": [ { "type": "INSPECTION", "title": "Checklist du pont roulant", "id": "e40a250a-…" } ],
  "formsCount": 1
}
```

**`InspectionFormResponse`** — one form with its questions, sorted by `position`:

```json
{
  "id": "e40a250a-…",
  "title": "Checklist du pont roulant",
  "type": "INSPECTION",
  "version": 1,
  "instructions": "L'opérateur doit inspecter l'équipement…",
  "questions": [
    { "id": "…", "position": 1, "labelAr": "…", "labelFr": "Affichage de la charge MAX", "critical": false, "answerType": "BON_MAUVAIS" }
  ]
}
```

**Status codes**

- `201` — form created
- `200` — `options` and `inspectionForm/{id}`
- `400` — validation failed, with `errors` listing each bad field
  (e.g. `"items[2].labelFr"`)
- `404` — `FormNotFoundException`: no form with that id
- `409` — `FormAlreadyExistException`: an active form with this title already
  exists, or the same title and version was saved concurrently

---

## `/api/v1/task` — TaskController

Requires auth. Maintenance tasks (work orders): a manager assigns a task on a
pump to a technician, who then moves it through its statuses. Every status
change also writes a row in `task_event` (the task's history).

Users are identified by **email** in this API: `technicianEmail`, `managerEmail`
and the event's `actorEmail` all hold emails, and the caller's email is taken
from the bearer token.

> Creating tasks is meant for managers and admins only, but no role check is
> enforced on `/new` yet: any authenticated user can call it.

| Method | Path | Who | Request | Java return type |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/task/mine` | technician | — | `ResponseEntity<ActiveTasks>` |
| POST | `/api/v1/task/new` | manager / admin | `TaskCreationDto` (JSON) | `ResponseEntity<?>` |
| POST | `/api/v1/task/{id}/start` | assigned technician | — | `ResponseEntity<?>` |
| POST | `/api/v1/task/{id}/block` | assigned technician | `TaskDeclineDto` (JSON) | `ResponseEntity<?>` |
| POST | `/api/v1/task/{id}/decline` | assigned technician | `TaskDeclineDto` (JSON) | `ResponseEntity<?>` |

Not available yet (commented out in the controller): `submit`, `cancel`,
`approve`, `return`, `reject`.

**Task statuses and allowed moves on the available routes**

| Route | From | To |
| --- | --- | --- |
| `new` | — | `ASSIGNED` |
| `start` | `ASSIGNED` (first start), `BLOCKED` (resume), `RETURNED` (rework) | `STARTED` |
| `block` | `STARTED` | `BLOCKED` |
| `decline` | `ASSIGNED` | `DECLINED` |

Any other move returns `409`. The full status list is `ASSIGNED, STARTED, BLOCKED,
SUBMITTED, DECLINED, CANCELED, REJECTED, RETURNED, APPROVED`.

**`TaskCreationDto`** — validated with `@Valid`:

```json
{
  "title": "Fuite garniture mécanique – pompe 23AP08",
  "taskType": "CORRECTIVE",
  "technicianEmail": "hicham2@gmail.com",
  "equipmentId": "2503523",
  "instructions": "Démonter, contrôler les faces et la chemise, remplacer si nécessaire.",
  "dueDate": "2026-10-25"
}
```

- `title`, `taskType`, `technicianEmail` and `equipmentId` are required;
  `instructions` and `dueDate` (`YYYY-MM-DD`) are optional.
- `taskType` is `MAINTENANCE`, `PREVENTIVE` or `CORRECTIVE`.
- `technicianEmail` must belong to an existing user with the `USER` (technician) role.
- The manager is the caller (from the token), never a body field.
- The server sets `status` (`ASSIGNED`), `priority` (`NORMAL`) and `createdAt`.
- `equipmentId` is free text for now: there is no equipment table to check it against.

Returns `201` with the new task's id:

```json
{ "id": "7c1f…" }
```

**`TaskDeclineDto`** — body of `block` and `decline`, validated with `@Valid`:

```json
{ "reason": "MISSING_PART", "comment": "pièce 6313 en rupture" }
```

- `reason` is required, one of `StatusReason`: `ON_LEAVE`, `WRONG_TASK`,
  `NO_ISSUE_FOUND` (meant for decline); `MISSING_PART`, `NO_ACCESS`,
  `SAFETY_ISSUE` (meant for block); `MISSING_INFO`, `WRONG_MEASUREMENT`,
  `INCOMPLETE_WORK`, `WRONG_ASSIGNMENT`, `DUPLICATE`, `OTHER`.
- The server does **not** yet check that the reason fits the route: any value is
  accepted on both.
- `comment` is optional.

**`start`, `block`, `decline`** return the id of the **event** written for the
change (not the task id):

```json
{ "id": "a91d…" }
```

`decline` uses the key `"deleted"` instead of `"id"` — see Known quirks.

**`ActiveTasks`** — `GET /mine`: the caller's tasks in `ASSIGNED`, `STARTED`,
`BLOCKED` or `RETURNED`, newest first:

```json
{
  "tasks": [
    {
      "id": "7c1f…",
      "title": "Fuite garniture mécanique – pompe 23AP08",
      "location": null,
      "equipmentId": "2503523",
      "dueDate": "2026-10-25",
      "priority": "NORMAL",
      "status": "STARTED",
      "instructions": "Démonter, contrôler les faces et la chemise, remplacer si nécessaire."
    }
  ],
  "tasksCount": 1
}
```

`location` is always `null` until equipment records exist. `instructions` can be `null`.

**Status codes**

- `201` — task created
- `200` — `mine`, `start`, `block`, `decline`
- `400` — validation failed (`errors` lists each bad field), an unknown enum value
  or a malformed date (the message lists the accepted values), or
  `technicianEmail` is not a technician (`InvalidRoleException`)
- `403` — the task is not assigned to the caller (`AccessDeniedException`)
- `404` — no task with that id (`TaskNotFoundException`), or `technicianEmail`
  matches no user (`UserNotFoundException`)
- `409` — the task's current status doesn't allow this move (`InvalidTaskException`),
  e.g. `"a task in status APPROVED can't be started"`

---

## Error responses

Every exception routed through `GlobalExceptionHandler` returns `ErrorFormat`:

```json
{
  "message": "no relevant document chunks for this question",
  "details": "uri=/api/v1/ask",
  "timestap": "2026-08-29T10:00:00",
  "errors": {}
}
```

`errors` is populated only by validation failures, mapping field name to message.

| Exception | Status |
| --- | --- |
| `UserNotFoundException` | 404 |
| `NoChunksException` | 404 |
| `NoAiResultException` | 502 |
| `FormNotFoundException` | 404 |
| `FormAlreadyExistException` | 409 |
| `IllegalArgumentException` | 400 |
| `MethodArgumentNotValidException` | 400 (with `errors` populated) |
| `FileNotSupportedException` | 400 |
| `SessionExpiredException` | 400 |
| `InvalidRoleException` | 400 |
| `HttpMessageNotReadableException` (malformed JSON, unknown enum value, bad date) | 400 |
| `AccessDeniedException` (`@PreAuthorize` refused, or not the caller's task) | 403 |
| `TaskNotFoundException` | 404 |
| `InvalidTaskException` | 409 |
| any other `Exception` | 500 |

Note that the `/api/auth/**` routes do **not** produce this shape — they build
their error bodies inline as `String` or `Map`, so an auth failure looks nothing
like a failure anywhere else in the API.

---

## Known quirks

Documented as they are, not as they should be:

- **`timestap`** — `ErrorFormat`'s getter is `getTimestap()`, so Jackson emits
  the misspelled key. There is no `timestamp` field.
- **`Role`** — `AuthResponse` declares its component as `Role`, capitalised, so
  the JSON key is likely `"Role"` rather than `"role"`. Worth confirming against
  a live response before relying on it.
- **`SessionExpiredException` returns 400**, not 401. The handler carries a
  comment acknowledging this.
- **List envelopes for single items** — `FileResponse` and `UserResponseWrapper`
  wrap one-element lists on routes that can only ever return one thing.
- **Trailing slash on form creation** — the route is `@PostMapping("/")`, so the
  URL is `/api/v1/forms/` with the slash. Spring Boot 3 doesn't match
  `/api/v1/forms` without it, which returns `404`.
- **`FormItem`** — `FormOptionsResponse` names its list component `FormItem`,
  capitalised, so the JSON key is `"FormItem"`.
- **`ResponseEntity<?>` across `/api/auth`** gives no compile-time guarantee
  about the body, and success and error shapes differ per route.
- **`register_manager`** uses an underscore while `register-admin` uses a hyphen.
- **Task actions return the event id** — `start`, `block` and `decline` return the
  id of the `task_event` row, not the task's id or its new status. A client that
  wants the updated task has to fetch it again.
- **`"deleted"` on `decline`** — the response key is `"deleted"` although nothing
  is deleted; the task moves to `DECLINED`.
- **`block` reuses `TaskDeclineDto`** — same body shape as `decline`; there is no
  separate block DTO.
