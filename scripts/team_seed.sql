-- The first manager's team: every technician who is in no team joins the team of one manager
-- (manager@phova.com unless psql is given -v manager=<email>).
-- Run by scripts/init-server.sh (step 8), or by hand:
--   psql -v manager=manager@phova.com -U ... -d ... < scripts/team_seed.sql
--
-- Safe to run again: it only fills a team it creates. Once the manager has a team, nothing
-- changes, so a technician he removed is not put back.
-- The tables (team, team_member) are created by the backend at its first start (ddl-auto=update):
-- run this after the new backend has started once.

\if :{?manager}
\else
  \set manager 'manager@phova.com'
\endif

BEGIN;

WITH manager AS (
    SELECT id FROM users WHERE email = :'manager' AND role = 'MANAGER'
), new_team AS (
    INSERT INTO team (id, manager_id, created_at)
    SELECT gen_random_uuid()::text, manager.id, now()
    FROM manager
    WHERE NOT EXISTS (SELECT 1 FROM team WHERE team.manager_id = manager.id)
    RETURNING id
)
INSERT INTO team_member (team_id, technician_id)
SELECT new_team.id, u.id
FROM new_team, users u
WHERE u.role = 'USER'
  AND NOT EXISTS (SELECT 1 FROM team_member tm WHERE tm.technician_id = u.id);

COMMIT;

-- the result: no row means there is no MANAGER account with this e-mail yet
SELECT m.email AS manager, count(tm.technician_id) AS technicians
FROM users m
JOIN team t ON t.manager_id = m.id
LEFT JOIN team_member tm ON tm.team_id = t.id
WHERE m.email = :'manager'
GROUP BY m.email;
