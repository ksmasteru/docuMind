-- Database checks after a deploy: what Hibernate's ddl-auto=update does not fix by itself.
-- Read-only: it only prints problems. Run it on the server from /opt/documind:
--   docker compose -f docker-compose.server.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < forms/server_db_check.sql
-- Both results should be "(0 rows)". The enum values below are the code's of 2026-11-12:
-- when an enum gains a value, add it here too.

-- 1. enum restrictions that miss a value the code now uses: run each "fix" line it prints
with expected(tbl, col, vals) as (values
  ('ask_interaction', 'verdict', 'PENDING,CONFIRMED,CORRECTED,REJECTED'),
  ('ask_interaction', 'ask_outcome', 'ANSWERED,NO_ANSWER,NO_CHUNKS,MULTI_PUMP'),
  ('check_list_item', 'answer_type', 'BON_MAUVAIS,TEXT,IMAGE,DATE,SINGLE_CHOICE,MULTI_CHOICE,MEASURE,PARTS_SUMMARY,TABLE'),
  ('check_list_submission', 'status', 'DRAFT,CONFORME,NON_CONFORME,VALIDATED'),
  ('check_list_template', 'check_list_type', 'INSPECTION,PERMIT'),
  ('check_list_template', 'layout', 'CONTROL_SHEET'),
  ('images_metadata', 'fix', 'MAINTENANCE,FAULT'),
  ('intervention', 'origin', 'CLIENT,ALERT'),
  ('intervention', 'current_step', 'COMPLETER_DEMANDE,ACCEPTER_DEMANDE,CONFIRMER_CONTRAT,ENREGISTRER_RECEPTION,RECEPTION_CONFORME,ANALYSE_RISQUES,AFFECTER_EQUIPE,DEMONTAGE_EXPERTISE,VALIDER_RAPPORT,VALIDER_BESOINS_DEVIS,ACCORD_DEVIS,DISPONIBILITE_PDR,SORTIE_PIECES,CONTROLE_QUALITE_PDR,AUTORISER_MONTAGE,MONTAGE_ESSAIS,CONTROLE_FINAL,VALIDER_ATTACHEMENT,DOSSIER_FINAL,FACTURATION'),
  ('intervention', 'step_status', 'A_TRAITER,EN_COURS,EN_ATTENTE,BLOQUE,A_CORRIGER,VALIDE'),
  ('intervention', 'status', 'EN_COURS,TERMINEE,ANNULEE'),
  ('intervention_event', 'step', 'COMPLETER_DEMANDE,ACCEPTER_DEMANDE,CONFIRMER_CONTRAT,ENREGISTRER_RECEPTION,RECEPTION_CONFORME,ANALYSE_RISQUES,AFFECTER_EQUIPE,DEMONTAGE_EXPERTISE,VALIDER_RAPPORT,VALIDER_BESOINS_DEVIS,ACCORD_DEVIS,DISPONIBILITE_PDR,SORTIE_PIECES,CONTROLE_QUALITE_PDR,AUTORISER_MONTAGE,MONTAGE_ESSAIS,CONTROLE_FINAL,VALIDER_ATTACHEMENT,DOSSIER_FINAL,FACTURATION'),
  ('intervention_event', 'action', 'CREATE,TAKE,VALIDATE,CANCEL,RETURN,WAIT,RESUME,BLOCK,UNBLOCK'),
  ('intervention_event', 'from_status', 'A_TRAITER,EN_COURS,EN_ATTENTE,BLOQUE,A_CORRIGER,VALIDE'),
  ('intervention_event', 'to_status', 'A_TRAITER,EN_COURS,EN_ATTENTE,BLOQUE,A_CORRIGER,VALIDE'),
  ('pump_models', 'type', 'OTW,OTC,OTS,PHB2,PHB3,PHH,HDX'),
  ('quote', 'status', 'DRAFT,SENT,ACCEPTED,REFUSED,CANCELED'),
  ('task_event', 'event_type', 'STATUS_CHANGED,REASSIGNED,COMMENTED'),
  ('task_event', 'from_status', 'ASSIGNED,STARTED,BLOCKED,SUBMITTED,DECLINED,CANCELED,REJECTED,RETURNED,APPROVED'),
  ('task_event', 'to_status', 'ASSIGNED,STARTED,BLOCKED,SUBMITTED,DECLINED,CANCELED,REJECTED,RETURNED,APPROVED'),
  ('task_event', 'reason', 'ON_LEAVE,WRONG_TASK,NO_ISSUE_FOUND,MISSING_PART,NO_ACCESS,SAFETY_ISSUE,MISSING_INFO,WRONG_MEASUREMENT,INCOMPLETE_WORK,WRONG_ASSIGNMENT,DUPLICATE,OTHER'),
  ('task', 'task_type', 'MAINTENANCE,PREVENTIVE,CORRECTIVE,VERIFICATION'),
  ('task', 'priority', 'LOW,NORMAL,HIGH,URGENT'),
  ('task', 'intervention_step', 'COMPLETER_DEMANDE,ACCEPTER_DEMANDE,CONFIRMER_CONTRAT,ENREGISTRER_RECEPTION,RECEPTION_CONFORME,ANALYSE_RISQUES,AFFECTER_EQUIPE,DEMONTAGE_EXPERTISE,VALIDER_RAPPORT,VALIDER_BESOINS_DEVIS,ACCORD_DEVIS,DISPONIBILITE_PDR,SORTIE_PIECES,CONTROLE_QUALITE_PDR,AUTORISER_MONTAGE,MONTAGE_ESSAIS,CONTROLE_FINAL,VALIDER_ATTACHEMENT,DOSSIER_FINAL,FACTURATION'),
  ('task', 'status', 'ASSIGNED,STARTED,BLOCKED,SUBMITTED,DECLINED,CANCELED,REJECTED,RETURNED,APPROVED'),
  ('task', 'status_reason', 'ON_LEAVE,WRONG_TASK,NO_ISSUE_FOUND,MISSING_PART,NO_ACCESS,SAFETY_ISSUE,MISSING_INFO,WRONG_MEASUREMENT,INCOMPLETE_WORK,WRONG_ASSIGNMENT,DUPLICATE,OTHER'),
  ('alert_case', 'source', 'TWIN,FIELD'),
  ('alert_case', 'severity', 'WARNING,CRITICAL'),
  ('alert_case', 'status', 'NEW,ACKNOWLEDGED,IN_PROGRESS,RESOLVED'),
  ('alert_case', 'priority', 'LOW,NORMAL,HIGH,URGENT'),
  ('alert_request', 'status', 'PENDING,ACCEPTED,REFUSED'),
  ('alert_case', 'verification', 'TO_CHECK,CHECK_ORDERED,CONFIRMED,FALSE_ALARM,INCONCLUSIVE'),
  ('alert_case', 'close_reason', 'FALSE_ALARM,FIXED,REPAIRED_BY_THIRD_PARTY,PLANNED_SHUTDOWN,RISK_ACCEPTED,OTHER'),
  ('check_point', 'kind', 'STATE,MEASURE'),
  ('check_report', 'arrival_state', 'RUNNING,STOPPED,LOCKED_OUT'),
  ('check_report', 'verdict', 'CONFIRMED,FALSE_ALARM,INCONCLUSIVE'),
  ('check_report', 'false_alarm_cause', 'PUMP_OK,SENSOR_FAULT,OPERATING_CONDITIONS'),
  ('check_report', 'inconclusive_reason', 'NO_ACCESS,MISSING_TOOL,PUMP_STOPPED,OTHER'),
  ('check_report', 'cannot_handle_reason', 'SKILLS,TOOLS_LIFTING,PARTS,WORKSHOP,OTHER'),
  ('check_report_result', 'kind', 'STATE,MEASURE'),
  ('check_report_result', 'result', 'OK,ANOMALY,NOT_CHECKABLE'),
  ('users', 'role', 'ADMIN,MANAGER,USER,SALES,BUSINESS_OPS,CONTRACT_ADMIN,PROJECT_LEAD,WORKSHOP_LEAD,HSE,STOREKEEPER,QUALITY,BILLING')
)
select format('alter table %I drop constraint %I;', e.tbl, c.conname) as fix,
       (select string_agg(v, ', ') from unnest(string_to_array(e.vals, ',')) v
         where position('''' || v || '''::' in pg_get_constraintdef(c.oid)) = 0) as missing
from expected e
join pg_constraint c on c.conrelid = to_regclass(e.tbl) and c.contype = 'c'
where position('(' || e.col || ')::text' in pg_get_constraintdef(c.oid)) > 0
  and exists (select 1 from unnest(string_to_array(e.vals, ',')) v
               where position('''' || v || '''::' in pg_get_constraintdef(c.oid)) = 0);

-- 2. empty values in columns the code reads as true/false or a number: each row it prints breaks loading that table
select * from (
  select 'refresh_tokens.revoked' as col, count(*) from refresh_tokens where revoked is null
  union all select 'login_links.revoked', count(*) from login_links where revoked is null
  union all select 'check_list_template.version', count(*) from check_list_template where version is null
  union all select 'check_list_template.active', count(*) from check_list_template where active is null
  union all select 'check_list_item.position', count(*) from check_list_item where position is null
  union all select 'check_list_item.critical', count(*) from check_list_item where critical is null
  union all select 'quote.version', count(*) from quote where version is null
  union all select 'quote.vat_applicable', count(*) from quote where vat_applicable is null
  union all select 'quote_line.position', count(*) from quote_line where position is null
  union all select 'quote_line.quantity', count(*) from quote_line where quantity is null
  union all select 'task.worked_seconds', count(*) from task where worked_seconds is null
  union all select 'intervention.urgent', count(*) from intervention where urgent is null
  union all select 'data_analyses.row_count', count(*) from data_analyses where row_count is null or col_count is null
  union all select 'document_chunks.chunk_index', count(*) from document_chunks where chunk_index is null
  union all select 'images_metadata.size', count(*) from images_metadata where size is null
  union all select 'files.size', count(*) from files where size is null
) t where count > 0;
