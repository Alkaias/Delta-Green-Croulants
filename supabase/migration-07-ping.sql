-- Migration 07 : petite fonction « ping » appelée automatiquement tous les 3 jours par GitHub
-- pour éviter la mise en veille des projets Supabase gratuits. Elle ne lit ni n'écrit aucune donnée.
-- À coller dans SQL Editor puis Run ; sans danger si relancé.
create or replace function public.ping() returns int language sql stable as $$ select 1 $$;
grant execute on function public.ping() to anon, authenticated;
