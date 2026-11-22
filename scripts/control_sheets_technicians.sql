-- The quality control sheets become fillable by technicians (USER) too, as well as by QUALITY
-- (decision of 2026-11-21, plan_forms_technician_assembly.md). forms/quality/*.json already say so for a new
-- server; this brings a server whose forms were created before up to date.
-- Run by scripts/init-server.sh (step 7b), or by hand:
--   psql -U ... -d ... < scripts/control_sheets_technicians.sql
--
-- Safe to run again: it only adds USER where it's missing, and never removes a role. It prints
-- "UPDATE <n>": how many forms gained USER (0 once done).

UPDATE check_list_template
   SET fill_roles = fill_roles || ',USER'
 WHERE paper_reference IN ('EN-CPE-QU-01', 'EN-PFD-MIC-01', 'EN-PFD-MIC-03', 'EN-PFD-MIC-04')
   AND fill_roles IS NOT NULL
   AND (',' || fill_roles || ',') NOT LIKE '%,USER,%';
