-- Migration 04 : année de campagne par groupe, et renommage du groupe de 4 en « Cellule K »
-- À coller dans SQL Editor puis Run ; sans danger si relancé.
alter table public.groupes add column if not exists annee text not null default '';
update public.groupes set nom = 'Cellule K', annee = '2011' where id = 'g1';
