-- Migration 01 : badges des agents (à coller dans SQL Editor puis Run ; sans danger si relancé)
create table if not exists public.agents_badges (
  agent      uuid primary key references public.agents(id) on delete cascade,
  image      text not null,
  modifie_le timestamptz not null default now()
);
alter table public.agents_badges enable row level security;
grant select, insert, update, delete on public.agents_badges to authenticated;
revoke all on public.agents_badges from anon;
drop policy if exists badges_lire on public.agents_badges;
create policy badges_lire on public.agents_badges for select to authenticated
  using (exists (select 1 from public.agents a where a.id = agent));
drop policy if exists badges_ecrire on public.agents_badges;
create policy badges_ecrire on public.agents_badges for all to authenticated
  using (public.est_mj() or exists (select 1 from public.agents a where a.id = agent and a.joueur = auth.uid()))
  with check (public.est_mj() or exists (select 1 from public.agents a where a.id = agent and a.joueur = auth.uid()));
