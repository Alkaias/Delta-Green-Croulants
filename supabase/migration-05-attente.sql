-- Migration 05 : tableau d'attente (ordre scellé, fil des événements, préparation des joueurs)
-- À coller dans SQL Editor puis Run ; sans danger si relancé (le contenu de la Cellule K n'est rempli que s'il est vide).
alter table public.groupes add column if not exists accroche  text  not null default '';
alter table public.groupes add column if not exists fil       jsonb not null default '[]'::jsonb;
alter table public.groupes add column if not exists checklist jsonb not null default '[]'::jsonb;

create table if not exists public.preparation (
  joueur     uuid primary key default auth.uid() references public.profils(id) on delete cascade,
  coches     jsonb not null default '[]'::jsonb,
  modifie_le timestamptz not null default now()
);
alter table public.preparation enable row level security;
grant select, insert, update, delete on public.preparation to authenticated;
revoke all on public.preparation from anon;
drop policy if exists preparation_lire on public.preparation;
create policy preparation_lire on public.preparation for select to authenticated
  using (joueur = auth.uid() or public.est_mj());
drop policy if exists preparation_soi on public.preparation;
create policy preparation_soi on public.preparation for insert to authenticated with check (joueur = auth.uid());
drop policy if exists preparation_maj on public.preparation;
create policy preparation_maj on public.preparation for update to authenticated
  using (joueur = auth.uid()) with check (joueur = auth.uid());

update public.groupes set fil = '[
  {"date":"3 juillet 2011","texte":"Opération FULMINATE : la cellule K exfiltre Brandon McGill de la vallée de Hetch Hetchy.","lien":{"type":"op","titre":"Opération FULMINATE"}},
  {"date":"6 juillet 2011","texte":"La presse annonce la fermeture de Hetch Hetchy après une « émanation de gaz d’origine souterraine ».","lien":{"type":"piece","titre":"Coupure de presse — 6 juillet 2011"}},
  {"date":"Juillet 2011","texte":"Retour à la vie civile. Chacun tente de reprendre le fil de ses habitudes.","lien":{"type":"dossier","titre":"Interlude 1"}},
  {"date":"Été 2011","texte":"David Callahan est muté par le National Park Service au Castle Clinton, à Manhattan."}
]'::jsonb
where id = 'g1' and fil = '[]'::jsonb;

update public.groupes set checklist = '[
  {"texte":"Lire le rapport de l’opération FULMINATE","lien":{"type":"op","titre":"Opération FULMINATE"}},
  {"texte":"Lire mon interlude de mission","lien":{"type":"dossier","titre":"Interlude 1"}},
  {"texte":"Confirmer ma présence le {seance}"}
]'::jsonb
where id = 'g1' and checklist = '[]'::jsonb;
