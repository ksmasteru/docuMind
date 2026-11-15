-- demo_workshop.sql: two workshop interventions for the demo, written the way the app writes them
-- (fix_workshop.md, InterventionService, TaskService). Each run creates two NEW interventions;
-- no existing row is changed.
--
--   A. hicham@gmail.com's démontage task. An intervention waiting at step 8 (Démontage + rapport
--      d'expertise), steps 1–7 validated by the role accounts (roles_accounts.sql). Hicham finds it in
--      « Tâches »; sending his report moves the intervention to step 9, in the Workshop Lead's queue.
--
--   B. The final file of pump 23AP08. An intervention waiting at step 18 (Valider attachement,
--      Business Ops' queue). Its démontage (step 8) and montage (step 16) reports are copies of the
--      report 43c75b1a… (« Rapport d'expertise V2 (complet) », Rapport_expertise_complet_23AP08.pdf):
--        - the démontage copy without the « … au remontage » measures,
--        - the montage copy without the « … au démontage » measures,
--      so the final file's « démontage vs remontage » table compares the right values.
--      The original report is left as it is (« Hors intervention », its QR code still valid).
--
-- Run it with the stack up:
--   docker compose exec -T postgres psql -U documind -d documind -v ON_ERROR_STOP=1 < demo_workshop.sql
-- then restart the backend once (docker compose restart backend): at startup it gives the two copies
-- their verification code, so their pages carry a QR code (VerificationService.backfill).
--
-- One shortcut the app itself would refuse: B has no devis (step 10 can't be validated without one),
-- so the final file's devis shows « — ».

BEGIN;

-- one line of an intervention's history, as InterventionService writes it
CREATE FUNCTION pg_temp.ev(p_int text, p_step text, p_action text, p_actor text,
                           p_from text, p_to text, p_comment text, p_at timestamptz)
RETURNS void LANGUAGE sql AS $f$
    INSERT INTO intervention_event (id, intervention_id, step, action, actor_email, from_status, to_status, comment, occurred_at)
    VALUES (gen_random_uuid()::text, p_int, p_step, p_action, p_actor, p_from, p_to, p_comment, p_at);
$f$;

-- a step done by its role: « Prendre en charge », then « Valider » 20 minutes later
CREATE FUNCTION pg_temp.step(p_int text, p_step text, p_actor text, p_at timestamptz)
RETURNS void LANGUAGE sql AS $f$
    SELECT pg_temp.ev(p_int, p_step, 'TAKE',     p_actor, 'A_TRAITER', 'EN_COURS', NULL, p_at);
    SELECT pg_temp.ev(p_int, p_step, 'VALIDATE', p_actor, 'EN_COURS',  'VALIDE',   NULL, p_at + interval '20 minutes');
$f$;

-- one line of a task's history, as TaskService writes it
CREATE FUNCTION pg_temp.tev(p_task text, p_pump text, p_actor text, p_from text, p_to text, p_at timestamptz)
RETURNS void LANGUAGE sql AS $f$
    INSERT INTO task_event (id, task_id, equipment_id, event_type, actor_email, from_status, to_status, occurred_at, received_at)
    VALUES (gen_random_uuid()::text, p_task, p_pump, 'STATUS_CHANGED', p_actor, p_from, p_to, p_at, p_at);
$f$;

-- steps 1 to 7 from Sales' request (p_t0): 1–6 validated, then the Workshop Lead's task order at step 7,
-- at p_t0 + 1 day 6 h 20 min
CREATE FUNCTION pg_temp.steps_1_to_7(p_int text, p_t0 timestamptz, p_task_title text, p_tech text)
RETURNS void LANGUAGE sql AS $f$
    -- Sales typed the client's request: step 1 starts « En cours » with him
    SELECT pg_temp.ev(p_int, 'COMPLETER_DEMANDE', 'CREATE',   'sales@phova.com', NULL,       'EN_COURS', NULL, p_t0);
    SELECT pg_temp.ev(p_int, 'COMPLETER_DEMANDE', 'VALIDATE', 'sales@phova.com', 'EN_COURS', 'VALIDE',   NULL, p_t0 + interval '30 minutes');
    SELECT pg_temp.step(p_int, 'ACCEPTER_DEMANDE',      'business_ops@phova.com',   p_t0 + interval '2 hours');
    SELECT pg_temp.step(p_int, 'CONFIRMER_CONTRAT',     'contract_admin@phova.com', p_t0 + interval '4 hours');
    SELECT pg_temp.step(p_int, 'ENREGISTRER_RECEPTION', 'project_lead@phova.com',   p_t0 + interval '1 day');
    SELECT pg_temp.step(p_int, 'RECEPTION_CONFORME',    'workshop_lead@phova.com',  p_t0 + interval '1 day 2 hours');
    SELECT pg_temp.step(p_int, 'ANALYSE_RISQUES',       'hse@phova.com',            p_t0 + interval '1 day 4 hours');
    SELECT pg_temp.ev(p_int, 'AFFECTER_EQUIPE', 'TAKE', 'workshop_lead@phova.com', 'A_TRAITER', 'EN_COURS', NULL,
                      p_t0 + interval '1 day 6 hours');
    SELECT pg_temp.ev(p_int, 'AFFECTER_EQUIPE', 'VALIDATE', 'workshop_lead@phova.com', 'EN_COURS', 'VALIDE',
                      'Tâche « ' || p_task_title || ' » assignée à ' || p_tech, p_t0 + interval '1 day 6 hours 20 minutes');
$f$;

-- the newest active version of the first form found among these titles
CREATE FUNCTION pg_temp.form(p_titles text[]) RETURNS text LANGUAGE sql AS $f$
    SELECT t.id FROM check_list_template t
    JOIN unnest(p_titles) WITH ORDINALITY AS w(title, rank) ON t.title = w.title
    WHERE t.active
    ORDER BY w.rank, t.version DESC
    LIMIT 1;
$f$;

-- a copy of a report for another task, without the answers whose question matches p_skip
-- (« % au remontage% »: the démontage copy; « % au démontage% »: the montage copy)
CREATE FUNCTION pg_temp.copy_report(p_src text, p_new text, p_task text, p_sent timestamptz, p_skip text)
RETURNS void LANGUAGE sql AS $f$
    INSERT INTO check_list_submission (id, template_id, equipment, user_id, inspection_date, submitted_at,
                                       status, remarks, task_id, extra_parts)
    SELECT p_new, template_id, equipment, user_id, inspection_date, p_sent, status, remarks, p_task, extra_parts
    FROM check_list_submission WHERE id = p_src;

    INSERT INTO check_list_answer (id, submission_id, item_id, value, comment)
    SELECT gen_random_uuid()::text, p_new, a.item_id, a.value, a.comment
    FROM check_list_answer a JOIN check_list_item i ON i.id = a.item_id
    WHERE a.submission_id = p_src AND coalesce(i.label_fr, '') NOT ILIKE p_skip;
$f$;


-- ==================================================================== A. Hicham's démontage task
DO $a$
DECLARE
    v_tech     text := 'hicham@gmail.com';
    v_pump     text := '23AP08';                         -- the pump sent to the workshop
    v_title    text := 'Démontage + expertise';          -- WorkshopAssign.jsx's title at step 7
    v_t0       timestamptz := now() - interval '2 days'; -- Sales' request
    v_assigned timestamptz := v_t0 + interval '1 day 6 hours 20 minutes';
    v_int      text := gen_random_uuid()::text;
    v_task     text := gen_random_uuid()::text;
    v_form     text := pg_temp.form(ARRAY['Rapport d''expertise V2 (démontage)', 'Rapport d''expertise (démontage)']);
    v_number   bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = v_tech AND role = 'USER') THEN
        RAISE EXCEPTION '% is not a technician account (users.role = USER)', v_tech;
    END IF;
    IF v_form IS NULL THEN
        RAISE EXCEPTION 'no active form « Rapport d''expertise V2 (démontage) » or « Rapport d''expertise (démontage) »';
    END IF;

    INSERT INTO intervention (id, origin, launched_by, equipment_id, fault, urgent, client, customer_order_number,
                              current_step, step_status, step_assignee, task_id, status, created_at, updated_at)
    VALUES (v_int, 'CLIENT', 'sales@phova.com', v_pump, 'Pompe de transfert : arbre bloqué', false,
            'OCP S.A', 'S-OT-7304134', 'DEMONTAGE_EXPERTISE', 'A_TRAITER', v_tech, v_task, 'EN_COURS', v_t0, v_assigned)
    RETURNING operation_number INTO v_number;

    PERFORM pg_temp.steps_1_to_7(v_int, v_t0, v_title, v_tech);

    -- the Workshop Lead's task order (POST /interventions/{id}/assign): ASSIGNED, in Hicham's « Tâches »
    INSERT INTO task (id, title, task_type, priority, due_date, technician_email, manager_email, equipment_id,
                      instructions, template_id, intervention_id, intervention_step, status, worked_seconds,
                      created_at, updated_at)
    VALUES (v_task, v_title, 'CORRECTIVE', 'NORMAL', current_date + 2, v_tech, 'workshop_lead@phova.com', v_pump,
            'Démonter la pompe et remplir le rapport d''expertise de démontage.', v_form, v_int, 'DEMONTAGE_EXPERTISE',
            'ASSIGNED', 0, v_assigned, v_assigned);
    PERFORM pg_temp.tev(v_task, v_pump, 'workshop_lead@phova.com', NULL, 'ASSIGNED', v_assigned);

    RAISE NOTICE 'A. intervention N° % (id %) waits at step 8: task % for %', v_number, v_int, v_task, v_tech;
END
$a$;


-- ==================================================================== B. the final file of pump 23AP08
DO $b$
DECLARE
    v_src_id text := '43c75b1a-c995-40f2-b0b9-6533378f9cca';  -- Rapport_expertise_complet_23AP08.pdf
    v_tech   text;
    v_pump   text;
    v_t0     timestamptz := now() - interval '12 days';        -- Sales' request
    v_int    text := gen_random_uuid()::text;
    v_task8  text := gen_random_uuid()::text;
    v_task16 text := gen_random_uuid()::text;
    v_rep8   text := gen_random_uuid()::text;
    v_rep16  text := gen_random_uuid()::text;
    v_form   text;
    v_number bigint;
    -- the loop's dates, from the request (v_t0) to the Contrôle final
    t7   timestamptz := v_t0 + interval '1 day 6 hours 20 minutes';  -- démontage task assigned (step 7)
    t8s  timestamptz := t7  + interval '1 hour';                     -- started
    t8   timestamptz := v_t0 + interval '2 days 5 hours';            -- démontage report sent
    t9   timestamptz := v_t0 + interval '3 days';                    -- step 9 taken, validated 20 min later
    t15  timestamptz := v_t0 + interval '7 days 20 minutes';         -- montage task assigned (step 15)
    t16s timestamptz := t15 + interval '1 hour';
    t16  timestamptz := v_t0 + interval '8 days 4 hours';            -- montage report sent
    t17  timestamptz := v_t0 + interval '9 days';                    -- step 17 taken, validated 20 min later
BEGIN
    SELECT user_id, equipment, template_id INTO v_tech, v_pump, v_form
    FROM check_list_submission WHERE id = v_src_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'report % not found', v_src_id;
    END IF;

    INSERT INTO intervention (id, origin, launched_by, equipment_id, fault, urgent, client, customer_order_number,
                              current_step, step_status, step_assignee, task_id, status, created_at, updated_at)
    VALUES (v_int, 'CLIENT', 'sales@phova.com', v_pump, 'Pompe de transfert : arbre bloqué', false,
            'OCP S.A', 'S-OT-7304134', 'VALIDER_ATTACHEMENT', 'A_TRAITER', NULL, v_task16, 'EN_COURS',
            v_t0, t17 + interval '20 minutes')
    RETURNING operation_number INTO v_number;

    -- the technician's two tasks, approved at steps 9 and 17
    INSERT INTO task (id, title, task_type, priority, technician_email, manager_email, equipment_id, instructions,
                      template_id, intervention_id, intervention_step, status, first_started_at, submitted_at,
                      latest_submission_id, worked_seconds, closed_at, created_at, updated_at)
    VALUES
      (v_task8, 'Démontage + expertise', 'CORRECTIVE', 'NORMAL', v_tech, 'workshop_lead@phova.com', v_pump,
       'Démonter la pompe et remplir le rapport d''expertise de démontage.', v_form, v_int, 'DEMONTAGE_EXPERTISE',
       'APPROVED', t8s, t8, v_rep8, extract(epoch FROM t8 - t8s)::bigint, t9 + interval '20 minutes',
       t7, t9 + interval '20 minutes'),
      (v_task16, 'Montage + essais', 'CORRECTIVE', 'NORMAL', v_tech, 'workshop_lead@phova.com', v_pump,
       'Remonter la pompe, faire les essais et remplir le rapport de montage.', v_form, v_int, 'MONTAGE_ESSAIS',
       'APPROVED', t16s, t16, v_rep16, extract(epoch FROM t16 - t16s)::bigint, t17 + interval '20 minutes',
       t15, t17 + interval '20 minutes');

    PERFORM pg_temp.tev(v_task8,  v_pump, 'workshop_lead@phova.com', NULL,        'ASSIGNED',  t7);
    PERFORM pg_temp.tev(v_task8,  v_pump, v_tech,                    'ASSIGNED',  'STARTED',   t8s);
    PERFORM pg_temp.tev(v_task8,  v_pump, v_tech,                    'STARTED',   'SUBMITTED', t8);
    PERFORM pg_temp.tev(v_task8,  v_pump, 'workshop_lead@phova.com', 'SUBMITTED', 'APPROVED',  t9 + interval '20 minutes');
    PERFORM pg_temp.tev(v_task16, v_pump, 'workshop_lead@phova.com', NULL,        'ASSIGNED',  t15);
    PERFORM pg_temp.tev(v_task16, v_pump, v_tech,                    'ASSIGNED',  'STARTED',   t16s);
    PERFORM pg_temp.tev(v_task16, v_pump, v_tech,                    'STARTED',   'SUBMITTED', t16);
    PERFORM pg_temp.tev(v_task16, v_pump, 'workshop_lead@phova.com', 'SUBMITTED', 'APPROVED',  t17 + interval '20 minutes');

    -- the two reports, each keeping only its own phase's measures
    PERFORM pg_temp.copy_report(v_src_id, v_rep8,  v_task8,  t8,  '% au remontage%');
    PERFORM pg_temp.copy_report(v_src_id, v_rep16, v_task16, t16, '% au démontage%');

    -- the history, steps 1 to 17
    PERFORM pg_temp.steps_1_to_7(v_int, v_t0, 'Démontage + expertise', v_tech);
    PERFORM pg_temp.ev(v_int, 'DEMONTAGE_EXPERTISE', 'VALIDATE', v_tech, 'A_TRAITER', 'VALIDE', 'Rapport envoyé', t8);
    PERFORM pg_temp.step(v_int, 'VALIDER_RAPPORT',       'workshop_lead@phova.com', t9);
    PERFORM pg_temp.step(v_int, 'VALIDER_BESOINS_DEVIS', 'project_lead@phova.com',  v_t0 + interval '4 days');
    PERFORM pg_temp.step(v_int, 'ACCORD_DEVIS',          'sales@phova.com',         v_t0 + interval '5 days');
    PERFORM pg_temp.step(v_int, 'DISPONIBILITE_PDR',     'project_lead@phova.com',  v_t0 + interval '6 days');
    PERFORM pg_temp.step(v_int, 'SORTIE_PIECES',         'storekeeper@phova.com',   v_t0 + interval '6 days 3 hours');
    PERFORM pg_temp.step(v_int, 'CONTROLE_QUALITE_PDR',  'quality@phova.com',       v_t0 + interval '6 days 6 hours');
    PERFORM pg_temp.ev(v_int, 'AUTORISER_MONTAGE', 'TAKE', 'workshop_lead@phova.com', 'A_TRAITER', 'EN_COURS', NULL,
                       v_t0 + interval '7 days');
    PERFORM pg_temp.ev(v_int, 'AUTORISER_MONTAGE', 'VALIDATE', 'workshop_lead@phova.com', 'EN_COURS', 'VALIDE',
                       'Tâche « Montage + essais » assignée à ' || v_tech, t15);
    PERFORM pg_temp.ev(v_int, 'MONTAGE_ESSAIS', 'VALIDATE', v_tech, 'A_TRAITER', 'VALIDE', 'Rapport envoyé', t16);
    PERFORM pg_temp.step(v_int, 'CONTROLE_FINAL',        'workshop_lead@phova.com', t17);

    RAISE NOTICE 'B. intervention N° % (id %) waits at step 18 for Business Ops; reports % (démontage) and % (montage)',
                 v_number, v_int, v_rep8, v_rep16;
END
$b$;

COMMIT;
