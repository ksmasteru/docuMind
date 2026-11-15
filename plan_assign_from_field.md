# Plan: assign the order straight to the technician on site (alert page)

Asked 2026-11-12: on an alert where a technician asked to intervene (here #9, Technicien Safi),
there should be a button that sends the work order directly to him.

## What is there today, and why the button is missing on #9

- A **pending** request shows "Accepter et lui assigner" / "Refuser" in the Terrain panel.
- On #9 the request was **already accepted** during my test: the task "Fuite d'huile au palier
  côté moteur · OTS-S-01" exists and is linked. The panel only says "Tâche créée par managerTest."
  with no link, so it looks like nothing happened and there is no button.
- The big "Faut-il intervenir sur cette pompe ? → Créer un ordre de travail" button always opens
  the technician list, even when a technician on site is the obvious choice.
- A technician who **confirmed** an alert or **reported** a fault, without asking, can only be
  assigned by finding him in that list.

## What changes (manager's alert page, `AlertDetail.jsx`)

1. **The "Faut-il intervenir" panel suggests the technician on site.** Its main button becomes
   **"Assigner à Technicien Safi"**, with why underneath:
   - he asked to intervene (pending request): sending the form also accepts his request
   - he reported the fault
   - he confirmed the alert on site

   The first in that order wins. Not suggested: someone who already got an order on this alert,
   or whose request was refused. "Créer un ordre de travail" stays, as the second button
   ("Un autre technicien").
2. **Orders already sent are named in that panel:** "Ordre envoyé à Technicien Safi : <title> →"
   (opens the Ordres de travail tab), instead of "1 ordre lié →".
3. **Terrain panel:**
   - accepted request: "Ordre envoyé par managerTest · Voir l'ordre →" instead of "Tâche créée…"
   - a confirmed verdict from someone with no order and no pending request: a "Lui assigner"
     button on his line
4. **The assign form's back link** goes back to the alert when opened from one (today it says
   "← Techniciens").

The assign form itself stays: it is pre-filled (technician, pump, title, the alert's message,
his message or his finding), and the manager still picks the type and the checklist, which every
task needs.

## Backend

- `AlertCaseView.Order` gets `technicianName` (the names are already looked up for the view), so
  the panel can say "Technicien Safi" instead of his email. No table change.

## Steps

- [x] Plan (this file)
- [x] Backend: `technicianName` on orders in the view
- [x] Frontend: who to suggest (`fieldAssignee`), the panel's main button, the orders sent
- [x] Frontend: Terrain panel (accepted → link to the order, "Lui assigner" on a confirmed verdict)
- [x] Frontend: assign form's back link to the alert
- [x] Checks: lint, build, backend tests; browser on a test backend (:8081) with the built app:
  - [x] #9 (accepted): no suggestion, "Ordre envoyé à Technicien Safi" link, Terrain link
  - [x] a case with a pending request: "Assigner à …" accepts the request (task in his list)
  - [x] a case he confirmed with no request: "Assigner à …" creates and links the order
  - [x] light theme and a narrow window

## What was checked (2026-11-12)

On a test backend (:8081) with the built app, as manager@phova.com:

- **#9** (request accepted earlier): no suggestion; the panel lists "Ordre envoyé à Technicien Safi :
  Fuite d'huile au palier côté moteur · OTS-S-01 →"; the Terrain line reads "Ordre envoyé par
  managerTest il y a 3 h · Voir l'ordre →" and opens the Ordres de travail tab, which now shows his
  name instead of his email.
- **#3** with a request waiting (made for the test): "Technicien Safi a demandé à intervenir.
  L'assigner accepte sa demande." → "Assigner à Technicien Safi" opens the form with `demande=`,
  his message in the instructions, and "← Alerte #3" as the way back.
- **#2** with his confirmed verdict (made for the test): suggested, plus "Lui assigner" on his
  verdict line; the form has no `demande=` and his finding in the instructions. "Un autre
  technicien" opens the technician list with the pump and the alert, as before.
- Phone width (390 px) in light theme: no horizontal scroll. No page error, no failed API call.
- Lint clean on the changed files; build OK; backend tests 25 run, 0 failures, 1 skipped.
- The test's request on #3 and verdict on #2 were deleted afterwards; the test servers are stopped.

Sending the form is the existing code (accepting a request was tested with the field alerts), so
the test stops at the pre-filled form and creates no task.
