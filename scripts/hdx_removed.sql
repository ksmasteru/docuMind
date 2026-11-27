-- HDX left the pump models (PumpType) on 2026-11-24 (plan_pump_manuals.md, question 1): it is the Flowserve pump
-- behind the PHB2, not a PHOVA model. What still says HDX in the database is moved; a second run changes nothing.
-- Run by scripts/init-server.sh (step 7c); on a local stack:
--   docker exec -i documind-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/hdx_removed.sql

-- a registered pump whose model was HDX could no longer be loaded: its model becomes « not known yet », to set
-- again on « Équipements ». The report platform (branch rapports) has no pump registry, so no table pump: skipped
do $$
begin
  if to_regclass('pump') is not null then
    update pump set model = null where model = 'HDX';
  end if;
end $$;

-- the simulated fleet's HDX pumps are now PHB2 pumps with the same number (HDX-S-08 -> PHB2-S-08,
-- fleetSimulator.js): their alerts follow them
update alert_case
   set pump_id  = 'PHB2' || substring(pump_id from 4),
       alert_key = 'PHB2' || substring(alert_key from 4),
       open_key = case when open_key is null then null else 'PHB2' || substring(open_key from 4) end
 where pump_id like 'HDX-%';

-- rows of the old model tables that name it
delete from pump_models where type = 'HDX';
delete from pump_model_document where model = 'HDX';
