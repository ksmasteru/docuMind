# Worked example: storing the pont roulant checklist

We'll use the real crane form, "Checklist pont roulant S02", and store it in two stages:

1. **Store the blank form once**, as a template.
2. **Store Monday's filled column**, as one submission.

See [CHECKLISTS.md](CHECKLISTS.md) for the overall design.

Here is the real paper sheet, simplified:

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHOVA   CHECKLIST DU PONT ROULANT     "L'opérateur doit inspecter    │  ← header
│                                         l'équipement avant de..."    │
│ Checklist N° : ___       Emplacement : MP1                           │
├────┬────────────────────────────┬─────────┬─────────┬─────┬─────────┤
│ N° │ Description                │  Lundi  │  Mardi  │ ... │Vendredi │
│    │                            │Bon│Mauv.│Bon│Mauv.│     │Bon│Mauv.│
├────┼────────────────────────────┼───┼─────┼───┼─────┼─────┼───┼─────┤
│ 1  │ Affichage charge MAX       │ X │     │ X │     │     │ X │     │  ← 16 questions
│ 4  │ Câble de levage            │   │  X  │   │  X  │     │   │  X  │
│ 14 │ Bruits inhabituels...      │   │  X  │   │  X  │     │   │  X  │
│ ...│                            │   │     │   │     │     │   │     │
├────┴────────────────────────────┼───┴─────┼───┴─────┼─────┼───┴─────┤
│ Nom du vérificateur             │ DEBLANI │ DEBLANI │     │ DEBLANI │  ← who
│ Date                            │05/01/26 │06/01/26 │     │09/01/26 │  ← when
│ Visa                            │  ~~~    │  ~~~    │     │  ~~~    │  ← signature
├─────────────────────────────────┴─────────┴─────────┴─────┴─────────┤
│ Remarques : ....................                                     │
└──────────────────────────────────────────────────────────────────────┘
```

First, sort every part of the sheet into one of two groups: things that are **the same on every copy**, and things that **change on every fill**.

```
SAME ON EVERY COPY  → TEMPLATE             CHANGES EVERY FILL  → SUBMISSION
─────────────────────────────────          ─────────────────────────────────
title "Checklist du pont roulant"          location "MP1"
the instruction in the header              the date
the 16 questions (FR + AR)                 the inspector's name
the Bon / Mauvais answer type              each Bon / Mauvais tick
the crane diagram                          the visa (signature)
                                           the remarks
```

That table is the whole design. Everything below just turns it into rows.

## Part 1: storing the blank form (the template)

### Step 1.1: one row in ChecklistTemplate

This row describes the form as a whole.

```
ChecklistTemplate
┌──────┬──────────────┬───────────────────────────┬────────────┬─────────┬────────┬───────────┬────────────────────┐
│ id   │ code         │ title                     │ type       │ version │ active │ frequency │ requiresValidation │
├──────┼──────────────┼───────────────────────────┼────────────┼─────────┼────────┼───────────┼────────────────────┤
│ T1   │ PONT_ROULANT │ Checklist du pont roulant │ INSPECTION │ 1       │ true   │ DAILY     │ false              │
└──────┴──────────────┴───────────────────────────┴────────────┴─────────┴────────┴───────────┴────────────────────┘
   + instructions = "L'opérateur doit inspecter l'équipement avant de commencer les travaux…"
   + imageUrl     = the crane diagram from the bottom of the sheet
```

What each column means:

- **code** is a stable name your code can use. The title can change, but `PONT_ROULANT` doesn't.
- **type** is `INSPECTION` because one person checks and signs. The flammable-products form would be `PERMIT`.
- **version 1** is the first version. If PHOVA changes the questions, the edited form becomes version 2.
- **active** lets an admin retire a form without deleting its history.
- **frequency DAILY** is taken from the sheet's columns, which run Monday to Friday.
- **requiresValidation false** means no supervisor co-signature is needed for this form.

### Step 1.2: sixteen rows in ChecklistItem

Each question on the sheet becomes one row, and every row points back to T1.

```
ChecklistItem
┌─────┬─────────────┬───────┬──────────────────────────────────────────────┬─────────────┬──────────┐
│ id  │ template_id │ order │ label_fr                                     │ answerType  │ critical │
├─────┼─────────────┼───────┼──────────────────────────────────────────────┼─────────────┼──────────┤
│ I1  │ T1          │ 1     │ Affichage de la charge MAX                   │ BON_MAUVAIS │ no       │
│ I2  │ T1          │ 2     │ Boîte de commande (usure, propreté…)         │ BON_MAUVAIS │ no       │
│ I3  │ T1          │ 3     │ Linguet de sécurité du crochet               │ BON_MAUVAIS │ YES      │
│ I4  │ T1          │ 4     │ Câble de levage (enroulement, usure…)        │ BON_MAUVAIS │ YES      │
│ I5  │ T1          │ 5     │ Moufle d'accrochage et crochet               │ BON_MAUVAIS │ YES      │
│ I6  │ T1          │ 6     │ Poulies : alignement des câbles, guide-câble │ BON_MAUVAIS │ no       │
│ I7  │ T1          │ 7     │ Accessoires de levage (élingues, manilles…)  │ BON_MAUVAIS │ no       │
│ I8  │ T1          │ 8     │ Avertisseur sonore                           │ BON_MAUVAIS │ no       │
│ I9  │ T1          │ 9     │ Bouton d'arrêt d'urgence                     │ BON_MAUVAIS │ YES      │
│ I10 │ T1          │ 10    │ Mouvements du pont roulant                   │ BON_MAUVAIS │ no       │
│ I11 │ T1          │ 11    │ Freins du pont roulant                       │ BON_MAUVAIS │ YES      │
│ I12 │ T1          │ 12    │ Fin de course de levage                      │ BON_MAUVAIS │ YES      │
│ I13 │ T1          │ 13    │ Fin de course au sol                         │ BON_MAUVAIS │ no       │
│ I14 │ T1          │ 14    │ Bruits inhabituels, vibrations…              │ BON_MAUVAIS │ no       │
│ I15 │ T1          │ 15    │ Réducteur, limiteur de charge, anticollision │ BON_MAUVAIS │ YES      │
│ I16 │ T1          │ 16    │ Bon alignement du câble sur la poulie        │ BON_MAUVAIS │ no       │
└─────┴─────────────┴───────┴──────────────────────────────────────────────┴─────────────┴──────────┘
  + label_ar on each row, copied from the Arabic text on the sheet
    e.g. I1 → "عرض الحمولة القصوى",  I9 → "زر التوقف الطارئ"
```

Three things to notice:

- **Every row has `template_id = T1`.** That column is what ties the sixteen questions to the crane form.
- **`order` controls the display order,** independently of the id. If PHOVA inserts a question later, you change `order` without touching ids.
- **The `critical` column is a proposal, not PHOVA's.** The paper sheet treats all items equally. The marked items are those whose failure can drop a load: hook latch, cable, hook, emergency stop, brakes, lifting limit switch and load limiter. PHOVA's safety team should confirm this list.

### The template as a picture

```
                 ┌─────────────────────────────┐
                 │ T1  PONT_ROULANT  v1        │
                 │ "Checklist du pont roulant" │
                 └──────────────┬──────────────┘
                                │ has 16 items
   ┌──────────┬──────────┬──────┴───┬──────────┬──────────┐
   ▼          ▼          ▼          ▼          ▼          ▼
 ┌────┐    ┌────┐     ┌────┐     ┌────┐     ┌────┐     ┌────┐
 │ I1 │    │ I3 │     │ I4 │ ... │ I9 │ ... │I14 │ ... │I16 │
 │    │    │ ⚠  │     │ ⚠  │     │ ⚠  │     │    │     │    │
 └────┘    └────┘     └────┘     └────┘     └────┘     └────┘
                      ⚠ = critical
```

These seventeen rows, one template plus sixteen items, are written **once**. From now on, no one touches them when filling the checklist.

## Part 2: storing a filled copy (the submission)

### Step 2.1: the paper sheet is five submissions, not one

This is the most important point. The paper squeezes five days onto one sheet to save paper. In the app, **each day is its own submission**, because each day has its own inspector, date and visa.

```
         ONE paper sheet                         FIVE submissions
┌─────────────────────────────────┐
│ Lundi │ Mardi │ ... │ Vendredi  │         S1  MP1  05/01  Deblani
│  col  │  col  │     │   col     │  ────►  S2  MP1  06/01  Deblani
│       │       │     │           │         S3  MP1  07/01  Deblani
└─────────────────────────────────┘         S4  MP1  08/01  Deblani
                                            S5  MP1  09/01  Deblani
```

We follow **Monday only**. On the real sheet, Monday's column is ticked "Bon" everywhere except item 4 (the cable) and item 14 (unusual noises), which are ticked "Mauvais".

### Step 2.2: the technician fills in the form on the phone

The phone downloads template T1 and draws one row per item. Deblani taps through the items:

```
┌─────────────────────────────────────┐
│ Pont roulant · MP1 · Lun 05/01/26   │
├─────────────────────────────────────┤
│ 1. Affichage charge MAX             │
│    [■ Bon ]  [  Mauvais ]           │
│ 3. Linguet de sécurité ⚠            │
│    [■ Bon ]  [  Mauvais ]           │
│ 4. Câble de levage ⚠                │
│    [  Bon ]  [■ Mauvais ]           │
│    ┌───────────────────────────┐    │  ← appears automatically:
│    │ Commentaire (obligatoire) │    │    critical item + Mauvais
│    │ fils cassés près du tambour│   │
│    └───────────────────────────┘    │
│    [ 📷 Photo ]                     │
│ ...                                 │
│ 14. Bruits inhabituels              │
│    [  Bon ]  [■ Mauvais ]           │
│    Commentaire (optionnel): ______  │  ← not critical: optional
│ ...                                 │
│          [ Envoyer ]                │
└─────────────────────────────────────┘
```

The comment "fils cassés près du tambour" is an example. The paper sheet has no comment for Monday, which is exactly what the app fixes: on paper you only know the cable is bad, not *why*.

### Step 2.3: the phone sends one message to the server

```json
{
  "templateId": "T1",
  "equipment": "MP1",
  "answers": [
    { "itemId": "I1",  "value": "BON" },
    { "itemId": "I2",  "value": "BON" },
    { "itemId": "I3",  "value": "BON" },
    { "itemId": "I4",  "value": "MAUVAIS", "comment": "fils cassés près du tambour" },
    { "itemId": "I5",  "value": "BON" },
    ...
    { "itemId": "I14", "value": "MAUVAIS" },
    { "itemId": "I15", "value": "BON" },
    { "itemId": "I16", "value": "BON" }
  ]
}
```

What the phone does **not** send:

- **The inspector's name.** The server takes it from the login token, so nobody can sign as someone else.
- **The date and time.** The server sets them, so a phone with a wrong clock can't produce a wrong date.
- **The status.** The server computes it, so the technician can't mark a failed check as compliant.

### Step 2.4: the server checks and decides the status

```
 received answers
       │
       ▼
 ① Are all 16 items answered? ─────── no ──► reject: "item 7 missing"
       │ yes
       ▼
 ② Does every critical MAUVAIS ────── no ──► reject: "comment required
    have a comment?                              for item 4"
       │ yes
       ▼
 ③ Is any critical item MAUVAIS?
       │
   I4 = MAUVAIS, and I4 is critical
       │ yes
       ▼
   status = NON_CONFORME   ──►  alert the supervisor
```

Item 14 is also "Mauvais", but it isn't critical, so on its own it wouldn't make the checklist non-compliant. Item 4 alone is enough.

### Step 2.5: the server saves one submission row and sixteen answer rows

```
ChecklistSubmission
┌────┬─────────────┬─────────────────┬───────────┬──────────┬──────────────────────┬──────────────┐
│ id │ template_id │ templateVersion │ equipment │ user     │ submittedAt          │ status       │
├────┼─────────────┼─────────────────┼───────────┼──────────┼──────────────────────┼──────────────┤
│ S1 │ T1          │ 1               │ MP1       │ deblani  │ 2026-01-05 07:42     │ NON_CONFORME │
└────┴─────────────┴─────────────────┴───────────┴──────────┴──────────────────────┴──────────────┘

Answer
┌─────┬───────────────┬─────────┬────────────────────────────┬─────────┬─────────────────────────────┐
│ id  │ submission_id │ item_id │ label_snapshot             │ value   │ comment                     │
├─────┼───────────────┼─────────┼────────────────────────────┼─────────┼─────────────────────────────┤
│ A1  │ S1            │ I1      │ Affichage de la charge MAX │ BON     │                             │
│ A2  │ S1            │ I2      │ Boîte de commande…         │ BON     │                             │
│ A3  │ S1            │ I3      │ Linguet de sécurité…       │ BON     │                             │
│ A4  │ S1            │ I4      │ Câble de levage…           │ MAUVAIS │ fils cassés près du tambour │
│ A5  │ S1            │ I5      │ Moufle d'accrochage…       │ BON     │                             │
│ ... │ S1            │ ...     │ ...                        │ BON     │                             │
│ A14 │ S1            │ I14     │ Bruits inhabituels…        │ MAUVAIS │                             │
│ A15 │ S1            │ I15     │ Réducteur, limiteur…       │ BON     │                             │
│ A16 │ S1            │ I16     │ Bon alignement du câble…   │ BON     │                             │
└─────┴───────────────┴─────────┴────────────────────────────┴─────────┴─────────────────────────────┘
```

The two columns that are easy to forget:

- **templateVersion = 1** records that Deblani answered version 1 of the form.
- **label_snapshot** copies the question text exactly as it appeared on screen. If an admin later renames item 4, this record still shows "Câble de levage".

## Part 3: how the pieces connect

Monday's check, fully linked:

```
       TEMPLATE SIDE (written once)            SUBMISSION SIDE (written every day)

      ┌────────────────────────┐              ┌─────────────────────────────────┐
      │ T1 PONT_ROULANT v1     │◄─────────────│ S1  MP1  05/01  deblani         │
      └───────────┬────────────┘ template_id  │     status: NON_CONFORME        │
                  │                           └───────────────┬─────────────────┘
                  │                                           │
      ┌───────────▼────────────┐                  ┌───────────▼─────────────────┐
      │ I4  Câble de levage  ⚠ │◄─────────────────│ A4  MAUVAIS                 │
      └────────────────────────┘     item_id      │     "fils cassés…"          │
      ┌────────────────────────┐                  └─────────────────────────────┘
      │ I14 Bruits inhabituels │◄─────────────────┌─────────────────────────────┐
      └────────────────────────┘                  │ A14 MAUVAIS                 │
                                                  └─────────────────────────────┘
      ...the other 14 items  ◄──────────────────── ...the other 14 answers (BON)
```

Each answer has **two arrows**. One points to the submission it belongs to, which says who answered and when. The other points to the question it answers.

Across the whole week, the database grows like this:

```
                 TEMPLATE                      SUBMISSIONS
Week 1       T1 + 16 items         S1 (Lun) + 16 answers
             (17 rows, once)       S2 (Mar) + 16 answers
                                   S3 (Mer) + 16 answers      = 85 rows
                                   S4 (Jeu) + 16 answers
                                   S5 (Ven) + 16 answers

Week 2       nothing new           S6 … S10                   = 85 more rows
```

The template never grows. Only submissions pile up, which is exactly what you want.

## What you get from storing it this way

The questions the paper sheet couldn't answer become simple queries:

```
"Show me every check of MP1"
   → submissions where equipment = MP1, newest first

"Which days was the cable reported bad?"
   → answers where item_id = I4 and value = MAUVAIS
   → S1, S2, S3, S4, S5   ← all week! the crane should have been stopped on Monday

"Which checks need attention today?"
   → submissions where status = NON_CONFORME and nobody has handled them yet
```

The second query is the argument for the app in one line. On paper, five days of "Mauvais" on the cable went unnoticed. In the database, Monday's answer already raised an alert.
