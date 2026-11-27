# Plan: the manager's « Tableau de bord » of reports

Asked on 2026-11-23: on the report platform, the manager sees how many reports were filed and the other figures
that help him run his team. Built on the branch `rapports` (folder `~/Desktop/documind-rapports`).

## What it shows (a period at the top: 7 days, 30 days, 90 days, everything; 30 by default)

**Whose reports:** the manager's, meaning the tasks he sent and the reports his technicians filed on their own (both
name him as their manager). The super admin sees every manager's, or one manager's from a list.

### Figures (stat tiles)
| Figure | How it is counted |
|---|---|
| Rapports déposés | reports filed in the period: a task's first report, not the corrected versions. Compared with the period before |
| dont à leur initiative | of those, the ones a technician filed on his own (« Formulaires », no task) |
| Corrections renvoyées | corrected versions sent in the period, after the manager sent a report back |
| Validés | reports the manager validated in the period |
| En attente de revue | reports waiting for him now, and how long the oldest has waited |
| Bon du premier coup | of the reports validated in the period, the share never sent back (same rule as the technician profile) |
| À l'heure | of the reports validated in the period that had a due date, the share sent by that day (same rule) |
| Délai de revue | on average, from the version he validated being sent to his validation |
| Non conformes | the share of the period's reports (every version) that found something « non conforme » |
| En retard | open tasks (to do, in progress, on hold, to correct) whose due date has passed |

### Charts and lists
- **Rapports déposés over time:** one column per day (7 and 30 days), per week (90 days), per month (everything).
  Single series, the app's accent, a tooltip per column.
- **By form:** ranked horizontal bars, the most filed first.
- **Per technician** (his whole team, even those with nothing in the period): reports filed, corrections,
  validated, sent back, « bon du premier coup », « à l'heure », average worked time per validated report, open
  tasks, late, last report. A row opens the technician's profile.
- **Waiting longest:** the 5 oldest reports waiting for review, each opening it in « Revue ».
- **Late:** the 5 open tasks most behind their due date.

Checks on site (levée de doute) are left out: they have no report form.

## How
- `GET /api/v1/stats/reports?days=30[&manager=…]`: MANAGER (his own, `manager` ignored) and ADMIN (every manager's,
  or `manager`'s). Computed by `ReportStatsService` from the tasks, their history and their reports, in four
  queries whatever the team's size. Days and weeks in Casablanca time.
- Web: `ReportStats.jsx` at `/statistiques`, « Tableau de bord ». On the report platform it is the manager's and
  the super admin's first page.
- Charts (dataviz guidance): stat tiles; columns at most 24 px wide with a 4 px rounded top; recessive hairline grid;
  one hue, so no legend (the title names it); a tooltip per mark; the values are also in the tables. The accent is
  `#1a75bc` on light. On dark the app's `#5bc6e8` is outside the validator's lightness band, so these charts use
  `#35a0c4`, which passes (validated 2026-11-23).

## Steps
- [x] backend: `ReportStatsService`, `ReportStats` (the response), `StatsController`, repository queries
- [x] web: `ReportStats.jsx`, route, « Tableau de bord » first for manager and admin on the report platform
- [x] tests: a unit test of the counting rules; the backend tests; web build and lint
- [x] on the running test stack: fill a few reports, look at the page (light and dark)
