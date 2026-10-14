# Checklists de sécurité dans l'application

Worked example with the real crane form: [CHECKLIST_PONT_ROULANT_EXEMPLE.md](CHECKLIST_PONT_ROULANT_EXEMPLE.md).

The paper form **"Checklist pont roulant S02"** is the best starting point. It is a real PHOVA checklist for an overhead crane: 16 items rated "Bon" or "Mauvais", filled daily from Monday to Friday, with the inspector's name, date, visa, location (MP1) and a remarks area. The app should digitise that form first, then generalise.

That scan also shows the strongest argument for the app. Items 4 (lifting cable) and 14 (unusual noises) are marked "Mauvais" every day of the week, and the crane kept being used. On paper, a defect gets recorded but nothing reacts to it. In the app, it would trigger an action.

## 1. The core idea: separate the template from the filled checklist

A checklist *template* describes the questions. A *submission* is one technician filling it in once. Admins manage templates as data, so a new checklist doesn't require code.

```
ChecklistTemplate        pont roulant, travail avec produits inflammables…
 ├─ id, title, type, version, active
 └─ ChecklistItem[]      order, label_fr, label_ar, critical, answerType
                         answerType: BON_MAUVAIS | OUI_NON_NA | NUMBER | TEXT | PHOTO

ChecklistSubmission      one filled checklist
 ├─ templateId + templateVersion   ← frozen, like prompt_version
 ├─ equipment / location  "MP1"
 ├─ userId, startedAt, submittedAt
 ├─ status: DRAFT | CONFORME | NON_CONFORME | VALIDATED
 └─ Answer[]             itemId, value, comment, photoUrl
```

Key decisions:

- **Versioning.** When someone edits a template, old submissions must still show the questions that were actually answered. Store the template version on each submission, or copy the item labels into the answers. Same lesson as `promptVersion` in `AskInteraction`.
- **Critical items.** Flag some items as critical (emergency stop, brakes, lifting cable). A "Mauvais" on a critical item should require a comment or photo, mark the submission non-compliant, and alert a supervisor. The app should tell the technician not to start the work.
- **Two kinds of checklist.** The crane checklist is a routine inspection that one person signs. Work with flammable products is closer to a *work permit*: it usually needs a supervisor's co-signature before work starts, and it is valid only for a limited time. Support both with a `requiresValidation` flag on the template and a `VALIDATED` status with the validator's id. Build the simple inspection flow first.
- **Signature.** The logged-in user plus a server timestamp replaces the handwritten visa. Ask PHOVA's safety (HSE) team whether that is legally sufficient or whether a drawn signature is required.

## 2. Where each part lives

- **Mobile app (documindMobile).** Technicians fill checklists on the shop floor, so the fill screen belongs there. One item per row with large Bon and Mauvais buttons. A comment and photo field opens automatically on "Mauvais". Drafts are saved on the phone, because network coverage near large equipment is often poor, and submitted when the phone reconnects.
- **Web app.** For admins and supervisors: template list and editor, submission history per piece of equipment, list of non-compliant submissions. This is also where missing daily checklists show up.
- **Backend.** The four entities above, endpoints to list templates, create or submit a submission and validate one, plus role checks. Only admins edit templates, only supervisors validate. The existing roles are USER and ADMIN, so this likely needs a SUPERVISOR role.
- **Later: QR codes on the equipment.** Scanning a code on the crane opens the right checklist with the location already filled in. That removes the most common data-entry error.

## 3. Suggested build order

1. **Seed the crane template from the paper form.** Its 16 items, in French and Arabic, as seed data.
2. **Mobile fill screen and submit endpoint.** At this point the paper is already replaced.
3. **Web history and non-compliant list.** What supervisors will look at.
4. **Critical items and alerts.**
5. **Template editor**, so admins can create the flammable-products checklist without code.
6. **Permit flow with co-signature, then offline mode and QR codes.**

## 4. Link with the chatbot

Every "Mauvais" with a comment is exactly the "connaissance interne capitalisée" that the WS3 study says is missing. Later, a technician who marks the cable as worn could ask the chatbot how to inspect it, and the answer would come from the manual.

## 5. Questions for PHOVA before coding

- What other paper checklists exist, especially the flammable-products one?
- Who must validate a checklist or a permit?
- What should happen after a "Mauvais"? Stop the work, alert someone, open a repair task?
- How long must records be kept?


It raises two needs the design doesn't cover yet:

Task assignment. A manager assigns tasks to each technician, and the technician works through the checklist on their phone.
Revision history per pump. Each pump keeps its periodic revisions, for example every six months.
Both fit the same model. A task would link a technician, a template and a piece of equipment. The pump's history would be the list of its submissions.