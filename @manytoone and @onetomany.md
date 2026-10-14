# @ManyToOne and @OneToMany

How the checklist submission tables are linked, and why each link uses `@ManyToOne`, `@OneToMany`, or both. Written while building `CheckListSubmission` and `CheckListAnswer` (4 October 2026).

---

## What was built

**`CheckListSubmission`**, one filled copy of a form (e.g. Monday's crane check on MP1):

- `template`: which template it answers (`@ManyToOne`)
- `equipment`, e.g. "MP1"
- `userId`: set by the server from the login token
- `submittedAt`: set automatically on insert (`@CreationTimestamp`)
- `status`: `SubmissionStatus` enum, computed by the server
- `remarks`: long text
- `answers`: `@OneToMany(mappedBy = "submission", cascade = ALL, orphanRemoval = true)`, plus an `addAnswer` helper that sets both sides

**`CheckListAnswer`**, the technician's answer to one question in one submission:

- `submission`: `@ManyToOne` with `@JoinColumn(name = "submission_id")`
- `item`: `@ManyToOne` with `@JoinColumn(name = "item_id")`
- `value`: `"BON"` / `"MAUVAIS"`, free text, or later a file reference
- `comment`: required by the service for a critical `MAUVAIS`

**`SubmissionStatus`**: `DRAFT`, `CONFORME`, `NON_CONFORME`, `VALIDATED`.

The resulting tables:

```
check_list_submission                      check_list_answer
  id, equipment, user_id,                    id, value, comment,
  submitted_at, status, remarks,             submission_id  → FK to check_list_submission
  template_id  → FK to check_list_template   item_id        → FK to check_list_item
```

---

## Step 1: count the arrows in real life

Before any annotation, ask two questions about each pair of things, using the crane example:

```
 Question                                                 Answer
 ───────────────────────────────────────────────────────  ──────────
 How many templates does ONE submission answer?           exactly 1
 How many submissions can ONE template have?              many (one per day, per machine…)

 How many submissions does ONE answer belong to?          exactly 1
 How many answers does ONE submission have?               many (16 for the crane)

 How many questions does ONE answer answer?               exactly 1
 How many answers can ONE question have?                  many (one in every submission)
```

Every pair has the same shape: **one on one side, many on the other**. That's a one-to-many relationship. `@ManyToOne` and `@OneToMany` are the **same relationship seen from its two ends**:

```
        many                         one
  ┌──────────────┐  @ManyToOne  ┌──────────────┐
  │  Submission  │ ───────────► │   Template   │     "many of me, one of you"
  │  Submission  │ ───────────► │              │
  │  Submission  │ ───────────► │              │
  └──────────────┘              └──────────────┘
                     ◄───────────
                     @OneToMany                      "one of me, many of you"
```

The annotation is named **from the point of view of the class you're writing in**:

- Inside `CheckListAnswer`: many answers, one submission → `@ManyToOne`
- Inside `CheckListSubmission`: one submission, many answers → `@OneToMany`

---

## Step 2: the database can only store the link on the "many" side

> Question I had: "does one column on the submission point to A LOT?"
> **No.** There's no column on the submission side at all.

A database cell holds **one value**. Try putting the link on the "one" side, in the submission table:

```
 ✘ link on the "one" side
 check_list_submission
 ┌────┬───────────┬─────────────────────────────────────────┐
 │ id │ equipment │ answer_ids                              │
 ├────┼───────────┼─────────────────────────────────────────┤
 │ S1 │ MP1       │ A1, A2, A3, A4, … A16   ← 16 values in  │
 └────┴───────────┴─────────────────────────────────────────┘   one cell: impossible
```

It doesn't fit, because one submission has sixteen answers. Now put it on the "many" side, in the answer table:

```
 ✔ link on the "many" side
 check_list_answer
 ┌─────┬───────────────┬─────────┬─────────┐
 │ id  │ submission_id │ item_id │ value   │
 ├─────┼───────────────┼─────────┼─────────┤
 │ A1  │ S1            │ I1      │ BON     │   ← each answer points to
 │ A4  │ S1            │ I4      │ MAUVAIS │     exactly ONE submission:
 │ ... │ S1            │ ...     │ ...     │     one value per cell ✔
 └─────┴───────────────┴─────────┴─────────┘
```

Each answer belongs to exactly one submission, so a single `submission_id` cell is enough.

> **Rule: the foreign key always lives on the "many" side.**
> That's why `@ManyToOne` carries `@JoinColumn(name = "submission_id")`: it's the side that owns the column.

---

## Step 3: where does `List<CheckListAnswer>` come from?

> Question I had: "why is it one to many? weirdo."

The list in `CheckListSubmission` is **not stored anywhere**. Hibernate **computes** it by asking the answer table:

```
 you call:   submission.getAnswers()      (on S1)
                     │
                     ▼
 Hibernate:  SELECT * FROM check_list_answer WHERE submission_id = 'S1'
                     │
                     ▼
 returns:    [A1, A2, … A16]
```

That's exactly what `mappedBy = "submission"` says: "I have no column. To find my answers, look at the `submission` field of `CheckListAnswer` and collect every answer that points to me." It's the same mechanism as the template and its questions.

```
  CheckListSubmission                        CheckListAnswer
  ┌──────────────────────────┐              ┌──────────────────────────────┐
  │ @OneToMany(              │              │ @ManyToOne                   │
  │   mappedBy="submission") │ ◄──────────► │ @JoinColumn(                 │
  │ List<CheckListAnswer>    │  same link   │   name="submission_id")      │
  │   answers                │              │ CheckListSubmission          │
  │                          │              │   submission                 │
  │ no column, computed      │              │ owns the column              │
  └──────────────────────────┘              └──────────────────────────────┘
       inverse side                               owning side
```

`mappedBy` takes the **Java field name** on the other class (`"submission"`), not the column name (`"submission_id"`).

---

## Step 4: why some links have only one end

Three relations exist, but only one has both annotations:

| Relation | Owning side (`@ManyToOne`) | Other end (`@OneToMany`)? |
|---|---|---|
| answer → submission | `CheckListAnswer.submission` | **Yes**: `submission.answers` |
| answer → question | `CheckListAnswer.item` | **No** |
| submission → template | `CheckListSubmission.template` | **No** |

The `@OneToMany` end is optional. Add it only when you **need to navigate in that direction from Java**:

- **The submission needs its answers.** They're built together, saved together with the cascade, and displayed together. The list is useful.
- **A question doesn't need its answers.** "Câble de levage" is answered in every daily check: 5 a week, 250 a year, thousands over time. A `List<CheckListAnswer>` on `CheckListItem` could load thousands of answers you almost never want. When you do need "every cable answer", for example all the days it was reported `MAUVAIS`, use a repository query.
- **A template doesn't need its submissions**, for the same reason: the crane template will collect hundreds of submissions.

```
 bidirectional (both ends)                  unidirectional (one end)
 submission ◄────────► answers              answer ─────────► item
 navigate both ways                         answer.getItem() works
 used when the "many" side is small         item.getAnswers() doesn't exist
 and loaded together                        (query the repository instead)
```

A link with only `@ManyToOne` is a perfectly normal, complete relationship. **The database is identical either way**: same `item_id` column, same foreign key. The `@OneToMany` end is only a Java convenience.

---

## Step 5: what cascade and `addAnswer` do

Because the submission owns its answers, build everything in memory and save once:

```java
CheckListSubmission submission = new CheckListSubmission();
submission.setTemplate(template);
submission.setEquipment("MP1");

CheckListAnswer answer = new CheckListAnswer();
answer.setItem(cableItem);
answer.setValue("MAUVAIS");
answer.setComment("fils cassés");
submission.addAnswer(answer);    // sets BOTH sides: list + answer.submission

submissionRepository.save(submission);   // cascade: saves the submission AND its answers
```

```
 save(submission)
      │
      ├─► INSERT check_list_submission (S1, MP1, …)
      └─► cascade = ALL
             ├─► INSERT check_list_answer (A1, submission_id = S1, item_id = I1, …)
             └─► INSERT check_list_answer (A4, submission_id = S1, item_id = I4, …)
```

**The trap.** Writing `answers.add(...)` directly instead of `addAnswer` leaves `answer.submission` null. Hibernate then tries to save `submission_id = NULL`, and `nullable = false` refuses it. Same trap as `addQuestion` on the template, which is why `getAnswers()` returns a read-only list.

---

## Cheat sheet

```
count first        "one X has many Y" → one-to-many

FK location        always on the MANY side (one value per cell)

@ManyToOne         on the many side, with @JoinColumn(name = "..._id")
                   owning side: holds the column

@OneToMany         on the one side, with mappedBy = "<field name on the other class>"
                   inverse side: no column, the list is computed by a query
                   optional: add it only if you navigate that way and the list stays small

helper method      parent.addChild(child) sets both sides; never add to the list directly

cascade = ALL      save the parent → children saved too
```

## Next

- `CheckListSubmissionRepository extends JpaRepository<CheckListSubmission, String>`. Answers don't need their own repository: the cascade saves them.
- Then step 2 of the submissions plan: the request DTO and the service checks ① to ⑦.
