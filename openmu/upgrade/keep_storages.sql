-- Before the first start on an OpenMU past 0.9.10: records our /baul vaults and marketplace boxes in
-- mu_plugins.kept_storage, so the CleanUpOrphanedAggregateMembers migration does not delete them.
-- It keeps every storage nothing else points at (the same test that migration uses). Safe to run again.
CREATE SCHEMA IF NOT EXISTS mu_plugins;
CREATE TABLE IF NOT EXISTS mu_plugins.kept_storage (
    storage_id uuid PRIMARY KEY REFERENCES data."ItemStorage"("Id") ON DELETE CASCADE);

do $$
declare
    reference record;
    conditions text := '';
begin
    for reference in
        select ss.nspname as s, st.relname as t, sc.attname as c
        from pg_constraint k
            join pg_class st on st.oid = k.conrelid
            join pg_namespace ss on ss.oid = st.relnamespace
            join pg_class rt on rt.oid = k.confrelid
            join pg_namespace rs on rs.oid = rt.relnamespace
            join pg_attribute sc on sc.attrelid = st.oid and sc.attnum = k.conkey[1]
        where k.contype = 'f' and rs.nspname = 'data' and rt.relname = 'ItemStorage'
          and st.relname not in ('Item', 'kept_storage')
    loop
        conditions := conditions || format(' and not exists (select 1 from %I.%I r where r.%I = x."Id")', reference.s, reference.t, reference.c);
    end loop;
    execute 'insert into mu_plugins.kept_storage (storage_id) select x."Id" from data."ItemStorage" x where true'
        || conditions || ' on conflict do nothing';
end $$;

select count(*) as kept from mu_plugins.kept_storage;
