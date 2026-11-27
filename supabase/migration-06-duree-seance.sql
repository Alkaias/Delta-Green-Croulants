-- Migration 06 : durée de jeu des séances (à coller dans SQL Editor puis Run ; sans danger si relancé)
alter table public.seances add column if not exists duree text not null default '';
