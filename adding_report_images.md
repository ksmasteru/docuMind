# Adding images to checklist answers

Your idea is right. The comment in [CheckListAnswer.java:34-35](backend/src/main/java/com/docuMind/backend/model/CheckListAnswer.java#L34-L35) already plans for it: `value` holds a reference to the image, never the image itself. Here are the decisions to make, with what I'd pick for each.

## 1. Where the bytes live

| Option | Pros | Cons |
|---|---|---|
| **A Postgres table** (`answer_images`: id, bytes, contentType, size, uploadedBy, createdAt) | Matches your `FileEntity`/`FileContent` split; one backup; transactional | Makes the DB bigger over time |
| Disk (Docker volume) | Simple, fast | Files and DB can drift apart; backups are separate |
| MinIO / S3 | The standard choice at scale | Another service to run |

**I'd go with Postgres for now.** Inspection photos are small and few. Write the code through a small `ImageStorage` service so you can switch to MinIO later without touching the rest.

**Watch out:** don't copy `@Lob byte[]` from `FileContent`. On PostgreSQL, Hibernate 6 maps it to a large object (`oid`), and those aren't deleted when the row is, so you leak storage. Use `@JdbcTypeCode(SqlTypes.VARBINARY)` (or `columnDefinition = "bytea"`) instead. This bug may already be in `FileContent`.

## 2. How the upload works

Right now `SubmissionRequest` is plain JSON. You have two choices:

- **Upload first, then submit (recommended):** `POST /submissions/images` (multipart) returns `{ "imageId": "…" }`. The app puts that id in `answer.value`, then sends the usual JSON. The submission API stays the same, and each photo uploads and retries on its own, which matters for technicians on a weak network.
  - The cost: an image can be uploaded and never submitted. Give each image a nullable `answer_id` and run a scheduled job that deletes unattached images older than 24h.
- **One multipart request** (JSON part plus files): all-or-nothing and no orphans. But it's one large request that has to start over if the connection drops, and it runs into your 20MB `max-request-size`.

## 3. Validation in `SubmissionService`

Right now an `IMAGE` answer goes through the same path as `TEXT`, so any string is accepted. For `IMAGE` items, the service should check that `value`:
- is an existing image id,
- was uploaded by the current user (otherwise someone could attach another person's photo by guessing its id),
- isn't already attached to another answer.

Then it attaches the image to the new answer in the same transaction.

**Should `value` be a string or a foreign key?** A plain string in `value` works, but the database can't enforce it: if the image is deleted, the id still points at nothing. A middle ground: the client still sends the id in `value` so the API stays uniform, and the service also sets a real FK (`image_id` on the answer, or `answer_id` on the image).

## 4. Getting images back out

- **Viewing:** `GET /submissions/images/{id}` streams the bytes with the right `Content-Type`. Restrict it to the uploader and managers.
- **PDF report:** the renderer can't call your authenticated endpoint. Load the bytes in the service and embed them in [submission-report.html](backend/src/main/resources/templates/submission-report.html) as `data:image/jpeg;base64,…`. The template treats anything that isn't bon/mauvais as text, so it needs a separate branch for image rows.

## 5. Checks on the upload itself

- Allow only JPEG/PNG/WebP, and check the file's magic bytes, not just the `Content-Type` the client claims.
- Compress on the phone before upload (about 1600px wide, JPEG quality around 0.8). This turns a 5MB photo into roughly 200–400KB.

---

**One question that changes the schema:** does an `IMAGE` question need exactly one photo, or can a technician attach several (for example, two angles of a damaged cable)? If it's one, the plan above works as is. If it's several, the link has to be on the image side (`answer_images.answer_id`, one answer to many images), and `value` would hold a list of ids or nothing at all.
