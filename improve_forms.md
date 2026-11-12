# Improving the form service

Ideas and known limits of the forms (templates, submissions, drafts, PDFs, verification), to come back to.
Add new entries at the top of their section. Mark an entry **done** with the date instead of deleting it.

## Quality & sales forms

- **Customers file their own complaints** (2026-11-10). For now PHOVA staff enters every réclamation client
  (EN-PNC-QU-02) on the customer's behalf, consistent with "the client never logs in" (workshop decisions,
  2026-11-04). Later: a public complaint form, like the `/verify` page, without login.
  - Spam and abuse: rate limit per address (Redis, like `/api/public/verify`), a captcha, attachment size limits.
  - What the customer fills: sections 1–3 only (contact, product, description, photos). Treatment and closure
    stay with Quality and Sales.
  - A received complaint lands as a draft case for Sales/Quality to accept (and link to a client) or dismiss,
    so nothing reaches the case list unchecked.
  - Tell the customer their number (RC-2026-0003) and let them follow its status by that number and their
    email, the same way a report is checked by its code.
- **Quality cases** (NC, réclamations client / fournisseur, dérogation). **For now (2026-11-10):** one-shot
  forms any PHOVA role fills, saved as tickets to finish later (« Fiches en cours », one person's own; several
  open per form). Later: a `QualityCase` like `Intervention` (system number NC-2026-0012, status, history),
  each stage an immutable submission by its role, corrective actions as tracked rows, cases linked
  (complaint → NC → derogation). Still open: who may treat, decide and close each type, and whether closing a
  client complaint needs both the Quality and the Sales signature as on paper.
- **Shared tickets.** A ticket is its author's alone: a colleague can't pick up a complaint someone else
  started. Hand-over (or a team queue) is the case workflow's job.

## Form engine

- **Template settings instead of title matching.** **Partly done 2026-11-10:** a template now has a `layout`
  (`CONTROL_SHEET`), the paper sheet's reference / edition / date, `fillRoles` and `readRoles`. The forms made
  before still switch on through their title (`StructuredAnswers.isV2`, `ExpertiseReport.isFor`): move them to
  a layout too, so no behaviour depends on a title.
- **Who may fill a form.** **Done 2026-11-10** for the forms that name their roles: listed, opened, previewed
  and accepted only for those roles. A form without `fillRoles` (every form made before) is still open to every
  role, so Quality sees the technicians' checklists too: set their roles (SQL for now, the form builder later).
- **Lot decision from the sampling plan.** The échantillonnage sheet stores the acceptance / rejection numbers
  but the decision is ticked by hand; it could be proposed from the count of « Non conforme » pieces.
- **A form builder for managers.** Forms change today through a Postman POST and a manual SQL `UPDATE` to
  deactivate the old version. A screen to edit, version and publish forms, showing which open tasks still
  use the old version. `expertiseComplet.js` matches labels: a renamed question can break the layout.
- **Filling offline.** Drafts are saved on the server, which needs a connection on site. A PWA could keep the
  form and its photos on the phone and send them when the connection is back.
- **Signatures.** The PDFs have an empty "Visa" / "Date et signature" box: sign when sending and approving,
  and include the signatures in the report's fingerprint.

## Verification (QR codes)

- The intervention dossier PDF has no QR code: it bundles several reports.
- Behind a proxy every visitor shares the proxy's address, so the 30 checks per minute limit is global.
- Anyone with a report's code can preview and download the whole report (photos, comments). Fine while only
  the paper's holder has the code; consider requiring a login for the preview for some clients.
- The fingerprint covers which photos a report uses, not the image files themselves.
