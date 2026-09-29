# How the AI improves from technician feedback

Short answer: **the AI doesn't learn by itself.** The model we call is fixed; a technician's rating changes nothing inside it. "Learning" here means **we** use the feedback to change what the model is given: better chunks, better prompts, more knowledge. There are several ways to do that, and they differ a lot in cost and payoff.

## The options, from most to least worthwhile

```
effort   ▲
         │                                            ⑥ build our own model
         │                                               (not feasible)
         │                                  ⑤ fine-tune the LLM
         │                       ④ tune retrieval on our data
         │             ③ approved corrections become documents
         │     ② reuse verified answers
         │ ① we diagnose and fix
         └──────────────────────────────────────────────────────────►
           start here                                     probably never
```

### ① We diagnose and fix (this is what the `ask_interaction` table is for)

Every week, look at the rejected and corrected answers. Use the `distance` and `rank` fields to decide whether retrieval or the prompt failed, fix that part, and bump `prompt_version`. The confirmed answers become a test set, so each change can be checked against real field questions.

The model itself doesn't change, but the system around it does. This is where most of the improvement comes from.

### ② Reuse verified answers

When a new question comes in, search past interactions for a very similar question with a confirmed answer:

```
new question ──► embed ──► close to a CONFIRMED past question?
                               │ yes                     │ no
                               ▼                         ▼
                  give that answer to the model     normal RAG
                  as trusted context
```

It works, with one trap: **don't return the old answer directly.** "Max pressure of the OTW-80" and "max pressure of the OTW-100" look almost identical as vectors but have different answers. Give the old answer to the model as extra context, and let it answer the question actually asked.

### ③ Corrections become knowledge

When a technician writes "the manual says 6 bar, but in practice this model trips at 5.5", that's knowledge that exists in no document. Once a reviewer approves it, save it as a "field notes" document and ingest it like any other file. Future answers retrieve it and cite it.

This is the closest thing to "the AI learns from the field", and it uses the pipeline we already have. The approval step is essential; without it, one wrong correction becomes truth for everyone.

### ④ Tune retrieval on our data (the realistic version of "our own model")

Most failures so far are **retrieval** failures: the right chunk isn't found. If reviewers mark which chunk actually contained the answer, we collect pairs like:

```
("what is the pump OTW pressure", chunk c-101) ← correct
("what is the pump OTW pressure", chunk c-587) ← wrong
```

After a few hundred of these, we can train a small **reranker**, or fine-tune the embedding model, so it understands our pump vocabulary. These models are small and cheap to train. This is a genuine "model for our data", and it targets the weak spot we already found.

It needs one extra field, set by a reviewer rather than the technician: which chunk was correct.

### ⑤ Fine-tune the LLM itself

We would train the model on approved question-and-answer pairs. It sounds like the obvious answer, but it's a poor fit here:

- It needs thousands of high-quality examples, not dozens.
- It teaches **style and format** well but **facts** unreliably. The model will sound confident, and can be confidently wrong about a pressure value.
- Facts learned this way can't be cited or updated. When a manual changes, we retrain.

Keep it in reserve for when the style or format of answers is wrong despite good prompts.

### ⑥ Build our own model from scratch

This isn't realistic: it takes enormous datasets and compute budgets. And a model trained only on our manuals would understand language much worse than the one we use now. Every one of our goals can be met with options ①–④.

## Plan, in order

1. **Now:** store interactions and review the bad ones every week (①).
2. **Next:** add a review step for corrections, and ingest the approved ones as field notes (③).
3. **Then:** reuse verified answers as context (②).
4. **Later, once we have a few hundred reviewed examples:** a reranker (④). This needs a nullable `correctChunkId` or an `isRelevant` flag in `RetrievedSource`, set during review.
