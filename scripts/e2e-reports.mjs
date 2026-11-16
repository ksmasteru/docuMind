#!/usr/bin/env node
// The report flow, end to end, through the API: accounts, fill, save, send, send back, correct,
// validate, cancel, reassign, and every refusal on the way (plan_reports_validation.md).
//
//   BASE_URL=http://localhost:8080 MANAGER_EMAIL=manager@phova.com MANAGER_PASSWORD=… node scripts/e2e-reports.mjs
//
// IT WRITES TEST DATA: two technician accounts (e2e.…@test.local), tasks and reports. Run it against a
// test server or a copy of the database, never the production one. Node 18 or later, no dependency.
//
// Optional:
//   SECOND_MANAGER_EMAIL / SECOND_MANAGER_PASSWORD   another manager (or an admin): checks that he can
//                                                    validate a report its sender did not get to
// Exit code: 0 when every check passes, 1 otherwise.
const BASE = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const MANAGER = process.env.MANAGER_EMAIL;
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD;
const SECOND = process.env.SECOND_MANAGER_EMAIL;
const SECOND_PASSWORD = process.env.SECOND_MANAGER_PASSWORD;
if (!MANAGER || !MANAGER_PASSWORD) {
  console.error("MANAGER_EMAIL and MANAGER_PASSWORD are required (see the top of this file).");
  process.exit(2);
}

let pass = 0, fail = 0, skipped = 0;
const ok = (cond, what, extra = "") => { if (cond) { pass++; console.log("  ✓", what); } else { fail++; console.log("  ✗", what, extra); } };
const skip = (what) => { skipped++; console.log("  –", what); };
const section = (title) => console.log(`\n${title}`);

const call = async (token, method, path, body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = r.headers.get("content-type") ?? "";
  if (type.includes("pdf")) return { status: r.status, pdf: Buffer.from(await r.arrayBuffer()) };
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
};
const login = async (email, password) => (await call(null, "POST", "/api/auth/login", { email, password })).data?.accessToken;
const msg = (r) => (typeof r.data === "object" && r.data ? r.data.message ?? r.data.error ?? JSON.stringify(r.data).slice(0, 160) : String(r.data).slice(0, 160));

// a small valid PNG (a grey square), as a photo
const PNG = (() => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const size = 64, row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x88)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return import("node:zlib").then(({ deflateSync }) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
})();
const upload = async (token, equipment) => {
  const form = new FormData();
  form.append("image", new Blob([await PNG], { type: "image/png" }), "photo.png");
  form.append("equipementId", equipment);
  const r = await fetch(BASE + "/api/v1/images", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  return (await r.json()).imageId;
};

const stamp = Date.now().toString(36);
const PUMP = "E2E-PUMP";
const today = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------------------------------------
section("1. Accounts: the manager creates the technicians");
const M = await login(MANAGER, MANAGER_PASSWORD);
ok(!!M, "the manager signs in");
if (!M) { console.log("\ncannot go on without the manager's session"); process.exit(1); }

let r = await call(null, "GET", "/api/auth/options");
const selfRegistration = r.data?.selfRegistration === true;
r = await call(null, "POST", "/api/auth/register", { name: "Intrus", email: `intrus.${stamp}@test.local`, password: "password-1" });
if (selfRegistration) skip("public sign-up is open on this server (ALLOW_SELF_REGISTRATION=true): its refusal is not checked");
else ok(r.status === 403, "public sign-up is refused", `${r.status} ${msg(r)}`);

const tech = { firstName: "Élodie", lastName: `Essai ${stamp}`, worksite: "Safi", email: `e2e.${stamp}@test.local`, password: "premier-mdp-1" };
r = await call(M, "POST", "/api/v1/team/technicians", { ...tech, lastName: "" });
ok(r.status === 400, "a technician without a last name is refused", `${r.status} ${msg(r)}`);
r = await call(M, "POST", "/api/v1/team/technicians", { ...tech, worksite: "" });
ok(r.status === 400, "without a site too", `${r.status}`);
r = await call(M, "POST", "/api/v1/team/technicians", { ...tech, password: "court" });
ok(r.status === 400, "and with a password under 8 characters", `${r.status}`);
r = await call(M, "POST", "/api/v1/team/technicians", tech);
const member = r.data?.members?.find((m) => m.email === tech.email);
ok(r.status === 201 && member?.name === `${tech.firstName} ${tech.lastName}` && member.worksite === "Safi", "the account is created, in his team, named « Prénom Nom »", `${r.status} ${msg(r)}`);
r = await call(M, "POST", "/api/v1/team/technicians", tech);
ok(r.status === 409, "the same e-mail twice is refused", `${r.status}`);

let T = await login(tech.email, tech.password);
ok(!!T, "the technician signs in with the password his manager set");
r = await call(T, "GET", "/api/v1/users/me");
ok(r.status === 200 && r.data.firstName === tech.firstName && r.data.passwordSetBySelf === false, "Mon compte: his name, and a password set by a manager", JSON.stringify(r.data).slice(0, 200));
r = await call(T, "POST", "/api/v1/users/me/password", { currentPassword: "pas-le-bon", newPassword: "mon-choix-123" });
ok(r.status === 400, "changing it with a wrong current password is refused", `${r.status}`);
r = await call(T, "POST", "/api/v1/users/me/password", { currentPassword: tech.password, newPassword: "court" });
ok(r.status === 400, "and with a new one too short", `${r.status}`);
r = await call(T, "POST", "/api/v1/users/me/password", { currentPassword: tech.password, newPassword: "mon-choix-123" });
ok(r.status === 200 && r.data.passwordSetBySelf === true, "he chooses his own password", `${r.status} ${msg(r)}`);
ok(!(await login(tech.email, tech.password)) && !!(await login(tech.email, "mon-choix-123")), "the old one no longer works, the new one does");

r = await call(M, "PUT", `/api/v1/team/technicians/${member.id}/account`, { firstName: "Elodie", lastName: tech.lastName, worksite: "Jorf" });
ok(r.status === 200 && r.data.members.find((m) => m.id === member.id)?.name === `Elodie ${tech.lastName}`, "his manager corrects his name and site", `${r.status} ${msg(r)}`);
r = await call(M, "POST", `/api/v1/team/technicians/${member.id}/password`, { password: "remis-a-zero-9" });
T = await login(tech.email, "remis-a-zero-9");
ok(r.status === 204 && !!T, "his manager resets his password", `${r.status}`);
r = await call(T, "GET", "/api/v1/users/me");
ok(r.data.passwordSetBySelf === false && r.data.worksite === "Jorf", "recorded as set by a manager again");

r = await call(T, "POST", "/api/v1/users", { name: "x", email: `x.${stamp}@test.local`, password: "password-1", role: "MANAGER" });
ok(r.status === 403, "a technician can't create accounts", `${r.status}`);
r = await call(T, "PUT", `/api/v1/users/${member.id}`, { name: "x", email: `vol.${stamp}@test.local`, password: "password-1" });
ok(r.status === 403, "nor change an account's e-mail", `${r.status}`);
r = await call(T, "POST", "/api/v1/team/technicians", { ...tech, email: `y.${stamp}@test.local` });
ok(r.status === 403, "nor use the manager's team pages", `${r.status}`);

const tech2 = { firstName: "Bilal", lastName: `Essai ${stamp}`, worksite: "Safi", email: `e2e2.${stamp}@test.local`, password: "second-mdp-22" };
await call(M, "POST", "/api/v1/team/technicians", tech2);
const T2 = await login(tech2.email, tech2.password);
ok(!!T2, "a second technician, for the reassignment");

// ------------------------------------------------------------------------------------------------
section("2. A checklist: saved while filling, sent, sent back, corrected, validated");
r = await call(T, "GET", "/api/v1/forms/options");
const forms = r.data?.FormItem ?? [];
let checklist = null;
for (const f of forms.filter((f) => !f.layout && !/expertise/i.test(f.title))) {
  const t = (await call(T, "GET", `/api/v1/forms/inspectionForm/${f.id}`)).data;
  if (t?.questions?.length && t.questions.every((q) => ["BON_MAUVAIS", "TEXT"].includes(q.answerType)) && t.questions.some((q) => q.critical && q.answerType === "BON_MAUVAIS")) { checklist = t; break; }
}
const newTask = async (title, technicianEmail, templateId) => {
  const res = await call(M, "POST", "/api/v1/task/new", { title, taskType: "PREVENTIVE", technicianEmail, equipmentId: PUMP, templateId, priority: "NORMAL", instructions: "Test automatique." });
  return res.data?.id;
};
const answersOf = (template, bad) => template.questions.map((q) => {
  const critical = q.critical && q.answerType === "BON_MAUVAIS";
  if (q.answerType === "TEXT") return { itemId: q.id, value: "RAS" };
  return critical && bad && q.id === template.questions.find((x) => x.critical && x.answerType === "BON_MAUVAIS").id
    ? { itemId: q.id, value: "MAUVAIS", comment: "Câble effiloché près du tambour." }
    : { itemId: q.id, value: "BON" };
});
const reportBody = (template, taskId, bad, state) => ({ templateId: template.id, taskId, equipment: PUMP, inspectionDate: today, remarks: "Test", answers: answersOf(template, bad), ...(state ? { draftPayload: state } : {}) });
const mine = async (token, taskId) => ((await call(token, "GET", "/api/v1/task/mine")).data?.tasks ?? []).find((t) => t.id === taskId);

if (!checklist) {
  skip("no active simple checklist with a critical point on this server: sections 2 to 4 need one");
} else {
  console.log(`  (form: ${checklist.title}, ${checklist.questions.length} questions)`);
  const task = await newTask(`E2E contrôle ${stamp}`, tech.email, checklist.id);
  ok(!!task, "the manager sends a task with the checklist");
  r = await call(T, "GET", "/api/v1/task/counts");
  ok(r.status === 200 && r.data.toDo >= 1, "the technician's tab counts it", JSON.stringify(r.data));
  await call(T, "POST", `/api/v1/task/${task}/start`);

  const STATE_1 = JSON.stringify({ kind: "e2e", step: 1, note: "état à l'envoi" });
  r = await call(T, "PUT", "/api/v1/drafts", { templateId: checklist.id, taskId: task, payload: JSON.stringify({ kind: "e2e", step: 0 }) });
  ok(r.status === 200, "a draft is saved while filling", `${r.status} ${msg(r)}`);
  r = await call(T, "GET", `/api/v1/drafts?templateId=${checklist.id}&taskId=${task}`);
  ok(r.status === 200 && JSON.parse(r.data.payload).step === 0, "and comes back when the form opens again");

  r = await call(T, "POST", "/api/v1/submissions", reportBody(checklist, task, true, STATE_1));
  const first = r.data?.id;
  ok(r.status < 300 && r.data.status === "NON_CONFORME", "the report is sent: non conforme (a critical point is bad)", `${r.status} ${msg(r)}`);
  r = await call(T, "GET", `/api/v1/drafts?templateId=${checklist.id}&taskId=${task}`);
  ok(r.status === 200 && r.data.payload === STATE_1, "its state is kept with it, in case it comes back");

  r = await call(M, "GET", "/api/v1/task/review");
  const line = (r.data?.tasks ?? []).find((t) => t.taskId === task);
  ok(!!line && line.technicianName === `Elodie ${tech.lastName}` && line.managerEmail === MANAGER, "it waits in the manager's Revue, with the names", JSON.stringify(line ?? {}).slice(0, 200));
  r = await call(M, "GET", "/api/v1/task/counts");
  ok(r.data.toReview >= 1 && r.data.toReviewAll >= r.data.toReview, "the manager's tab counts it", JSON.stringify(r.data));
  r = await call(M, "GET", `/api/v1/submissions/${first}`);
  ok(r.status === 200 && r.data.review?.state === "PENDING" && r.data.review.trail.length >= 3, "the report says it waits, and shows the task's history", JSON.stringify(r.data.review ?? {}).slice(0, 200));
  r = await call(T2, "GET", `/api/v1/submissions/${first}`);
  ok(r.status === 404, "another technician can't read it", `${r.status}`);

  r = await call(M, "POST", `/api/v1/task/${task}/approve`);
  ok(r.status === 400 && /suite donnée/i.test(msg(r)), "validating a non-conforming report in silence is refused", `${r.status} ${msg(r)}`);
  r = await call(T, "POST", `/api/v1/task/${task}/approve`, { comment: "x" });
  ok(r.status === 403, "a technician can't validate", `${r.status}`);
  r = await call(M, "POST", `/api/v1/task/${task}/return`, { comment: "" });
  ok(r.status === 400, "sending back without saying what to redo is refused", `${r.status}`);
  r = await call(M, "POST", `/api/v1/task/${task}/return`, { reason: "MISSING_INFO", comment: "Précisez l'état du câble." });
  ok(r.status === 200, "the manager sends it back", `${r.status} ${msg(r)}`);

  let t = await mine(T, task);
  ok(t?.status === "RETURNED" && t.returnComment === "Précisez l'état du câble.", "it is back in his tasks, with what to redo");
  await call(T, "POST", `/api/v1/task/${task}/start`);
  t = await mine(T, task);
  ok(t?.status === "STARTED" && t.returnComment === "Précisez l'état du câble." && !t.statusComment, "the request stays above his form while he corrects");
  r = await call(T, "GET", `/api/v1/drafts?templateId=${checklist.id}&taskId=${task}`);
  ok(r.status === 200 && r.data.payload === STATE_1, "the form reopens as it was sent");
  r = await call(T, "POST", "/api/v1/submissions", reportBody(checklist, task, false, JSON.stringify({ kind: "e2e", step: 2 })));
  const second = r.data?.id;
  ok(r.status < 300 && r.data.status === "CONFORME", "he sends the corrected report: conforme", `${r.status} ${msg(r)}`);

  const reviewer = SECOND && SECOND_PASSWORD ? await login(SECOND, SECOND_PASSWORD) : null;
  if (reviewer) {
    r = await call(reviewer, "GET", "/api/v1/task/review");
    ok(!(r.data?.tasks ?? []).some((x) => x.taskId === task), "another manager doesn't see it in his own reports");
    r = await call(reviewer, "GET", "/api/v1/task/review?scope=all");
    ok((r.data?.tasks ?? []).some((x) => x.taskId === task && x.managerEmail === MANAGER), "but finds it in « Tous les rapports », with whose task it is");
    r = await call(reviewer, "GET", `/api/v1/submissions/${second}`);
    ok(r.status === 200, "and can read it", `${r.status}`);
    r = await call(reviewer, "POST", `/api/v1/task/${task}/approve`);
    ok(r.status === 200, "he validates it in the sender's absence", `${r.status} ${msg(r)}`);
  } else {
    skip("no SECOND_MANAGER_EMAIL: validation by another manager is not checked");
    r = await call(M, "POST", `/api/v1/task/${task}/approve`);
    ok(r.status === 200, "the manager validates it", `${r.status} ${msg(r)}`);
  }
  r = await call(M, "POST", `/api/v1/task/${task}/approve`);
  ok(r.status === 409, "validating it twice is refused", `${r.status}`);

  r = await call(T, "GET", `/api/v1/submissions/${second}`);
  ok(r.data.review?.state === "APPROVED" && r.data.review.reviewer && !r.data.review.reviewer.includes("@") && /\d\d\/\d\d\/\d{4}/.test(r.data.review.reviewedAt ?? ""),
    "the report says who validated it and when, by name", JSON.stringify(r.data.review ?? {}).slice(0, 160));
  r = await call(T, "GET", `/api/v1/submissions/${first}`);
  ok(r.data.review?.state === "RETURNED" && r.data.review.comment === "Précisez l'état du câble.", "the first version says it was sent back, and why");
  r = await call(T, "GET", `/api/v1/submissions/${second}/pdf`);
  ok(r.status === 200 && r.pdf?.subarray(0, 5).toString() === "%PDF-", "its PDF is produced", `${r.status}`);
  r = await call(T, "GET", "/api/v1/task/mine/sent");
  const sent = (r.data ?? []).find((x) => x.id === task);
  ok(sent?.status === "APPROVED" && sent.reviewerName && sent.submissionId === second, "« Envoyés » shows it validated, by whom", JSON.stringify(sent ?? {}).slice(0, 200));
  r = await call(T, "GET", `/api/v1/drafts?templateId=${checklist.id}&taskId=${task}`);
  ok(r.status === 204, "the kept state is gone once the task is closed", `${r.status}`);

  // ----------------------------------------------------------------------------------------------
  section("3. A non-conforming report validated with what is done about it");
  const nc = await newTask(`E2E non conforme ${stamp}`, tech.email, checklist.id);
  await call(T, "POST", `/api/v1/task/${nc}/start`);
  const ncReport = (await call(T, "POST", "/api/v1/submissions", reportBody(checklist, nc, true))).data?.id;
  r = await call(M, "POST", `/api/v1/task/${nc}/approve`, { comment: "Câble remplacé le jour même, pont remis en service." });
  ok(r.status === 200, "validated with « Suite donnée »", `${r.status} ${msg(r)}`);
  r = await call(M, "GET", `/api/v1/submissions/${ncReport}`);
  ok(r.data.review?.state === "APPROVED" && /Câble remplacé/.test(r.data.review.comment ?? ""), "kept with the validation, on the report");
  r = await call(T, "GET", "/api/v1/task/mine/sent");
  ok(/Câble remplacé/.test((r.data ?? []).find((x) => x.id === nc)?.followUp ?? ""), "and shown to the technician");

  // ----------------------------------------------------------------------------------------------
  section("4. Cancel and reassign");
  const toCancel = await newTask(`E2E à annuler ${stamp}`, tech.email, checklist.id);
  r = await call(M, "POST", `/api/v1/task/${toCancel}/cancel`, { comment: "" });
  ok(r.status === 400, "canceling without a reason is refused", `${r.status}`);
  r = await call(T, "POST", `/api/v1/task/${toCancel}/cancel`, { comment: "x" });
  ok(r.status === 403, "a technician can't cancel", `${r.status}`);
  r = await call(M, "POST", `/api/v1/task/${toCancel}/cancel`, { reason: "DUPLICATE", comment: "Doublon." });
  ok(r.status === 200 && !(await mine(T, toCancel)), "the manager cancels a task: it leaves the technician's list", `${r.status} ${msg(r)}`);
  r = await call(M, "POST", `/api/v1/task/${toCancel}/cancel`, { comment: "encore" });
  ok(r.status === 409, "canceling it twice is refused", `${r.status}`);
  const sentTask = await newTask(`E2E envoyée ${stamp}`, tech.email, checklist.id);
  await call(T, "POST", `/api/v1/task/${sentTask}/start`);
  await call(T, "POST", "/api/v1/submissions", reportBody(checklist, sentTask, false));
  r = await call(M, "POST", `/api/v1/task/${sentTask}/cancel`, { comment: "trop tard" });
  ok(r.status === 409, "a task whose report is sent can't be canceled", `${r.status}`);
  await call(M, "POST", `/api/v1/task/${sentTask}/approve`);

  const toMove = await newTask(`E2E à réaffecter ${stamp}`, tech.email, checklist.id);
  r = await call(T, "POST", `/api/v1/task/${toMove}/decline`, { reason: "ON_LEAVE", comment: "En congé jusqu'à lundi." });
  ok(r.status === 200, "the technician declines a task", `${r.status} ${msg(r)}`);
  r = await call(M, "GET", "/api/v1/task/declined");
  ok((r.data?.tasks ?? []).some((x) => x.id === toMove && /congé/.test(x.statusComment ?? "")), "it waits in the manager's « À réaffecter », with the reason");
  r = await call(M, "GET", "/api/v1/task/assigned");
  ok(!(r.data?.tasks ?? []).some((x) => x.id === toMove), "and is not counted among the active orders");
  r = await call(M, "GET", "/api/v1/task/counts");
  ok(r.data.declined >= 1, "the Ordres tab counts it", JSON.stringify(r.data));
  r = await call(T2, "POST", `/api/v1/task/${toMove}/reassign`, { technicianEmail: tech2.email });
  ok(r.status === 403, "a technician can't reassign", `${r.status}`);
  r = await call(M, "POST", `/api/v1/task/${toMove}/reassign`, { technicianEmail: MANAGER });
  ok(r.status >= 400 && r.status < 500, "nor can it go to someone who isn't a technician", `${r.status}`);
  r = await call(M, "POST", `/api/v1/task/${toMove}/reassign`, { technicianEmail: tech2.email });
  const moved = await mine(T2, toMove);
  ok(r.status === 200 && moved?.status === "ASSIGNED" && !(await mine(T, toMove)), "the manager gives it to the second technician, who finds it assigned", `${r.status} ${msg(r)}`);
  await call(T2, "POST", `/api/v1/task/${toMove}/start`);
  r = await call(M, "POST", `/api/v1/task/${toMove}/reassign`, { technicianEmail: tech.email });
  ok(r.status === 409, "a task already started can't change hands", `${r.status}`);
  await call(M, "POST", `/api/v1/task/${toMove}/cancel`, { comment: "Fin du test." });
}

// ------------------------------------------------------------------------------------------------
section("5. An expertise report with photos, sent back: the same photos go again");
const v2 = forms.find((f) => /Rapport d'expertise V2 \(montage\)/i.test(f.title)) ?? forms.find((f) => /Rapport d'expertise V2/i.test(f.title));
const template = v2 ? (await call(T, "GET", `/api/v1/forms/inspectionForm/${v2.id}`)).data : null;
const photoQuestion = template?.questions?.find((q) => q.answerType === "IMAGE");
if (!photoQuestion) {
  skip("no v2 expertise report with a photo question on this server");
} else {
  const task = await newTask(`E2E expertise ${stamp}`, tech.email, template.id);
  await call(T, "POST", `/api/v1/task/${task}/start`);
  const photo = await upload(T, PUMP);
  ok(!!photo, "a photo is uploaded");
  const body = () => ({
    templateId: template.id, taskId: task, equipment: PUMP, inspectionDate: today, remarks: null,
    answers: template.questions.map((q) => ({ itemId: q.id, value: q.id === photoQuestion.id ? JSON.stringify([{ imageId: photo, title: "Vue d'ensemble", comment: "" }]) : "" })),
    draftPayload: JSON.stringify({ v: 1, index: 0, remarks: "", answers: {}, extraParts: [] }),
  });
  r = await call(T, "POST", "/api/v1/submissions", body());
  ok(r.status < 300, "the report is sent with its photo", `${r.status} ${msg(r)}`);
  if (r.status < 300) {
    await call(M, "POST", `/api/v1/task/${task}/return`, { comment: "Ajoutez la mesure du jeu." });
    await call(T, "POST", `/api/v1/task/${task}/start`);
    r = await call(T, "POST", "/api/v1/submissions", body());
    ok(r.status < 300, "sent again after the return, with the same photo", `${r.status} ${msg(r)}`);
    const other = await newTask(`E2E expertise bis ${stamp}`, tech.email, template.id);
    await call(T, "POST", `/api/v1/task/${other}/start`);
    r = await call(T, "POST", "/api/v1/submissions", { ...body(), taskId: other });
    ok(r.status === 409, "but a photo of another task's report is still refused", `${r.status} ${msg(r)}`);
    await call(M, "POST", `/api/v1/task/${other}/cancel`, { comment: "Fin du test." });
    await call(M, "POST", `/api/v1/task/${task}/approve`, { comment: "Fin du test." });
  }
}

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
process.exit(fail ? 1 : 0);
