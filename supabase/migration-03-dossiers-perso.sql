-- Migration 03 : dossiers personnels des agents (interludes, vie quotidienne, pièces privées)
-- À coller dans SQL Editor puis Run ; sans danger si relancé.
create table if not exists public.dossiers_perso (
  id         uuid primary key default gen_random_uuid(),
  agent      uuid not null references public.agents(id) on delete cascade,
  titre      text not null,
  sous_titre text not null default '',
  texte      text not null default '',
  images     jsonb not null default '[]'::jsonb,
  visible    boolean not null default false,
  ordre      int not null default 0,
  cree_le    timestamptz not null default now()
);
alter table public.dossiers_perso enable row level security;
grant select, insert, update, delete on public.dossiers_perso to authenticated;
revoke all on public.dossiers_perso from anon;
-- un joueur ne voit que les dossiers visibles de SON agent ; le MJ voit et gère tout
drop policy if exists dossiers_perso_lire on public.dossiers_perso;
create policy dossiers_perso_lire on public.dossiers_perso for select to authenticated
  using (public.est_mj() or (visible and exists (select 1 from public.agents a where a.id = agent and a.joueur = auth.uid())));
drop policy if exists dossiers_perso_mj on public.dossiers_perso;
create policy dossiers_perso_mj on public.dossiers_perso for all to authenticated
  using (public.est_mj()) with check (public.est_mj());

insert into storage.buckets (id, name, public) values ('personnel', 'personnel', false)
on conflict (id) do nothing;
drop policy if exists personnel_lire on storage.objects;
create policy personnel_lire on storage.objects for select to authenticated
  using (bucket_id = 'personnel' and exists (select 1 from public.dossiers_perso d
         where d.id::text = (storage.foldername(name))[1]));
drop policy if exists personnel_ajout on storage.objects;
create policy personnel_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'personnel' and public.est_mj());
drop policy if exists personnel_maj on storage.objects;
create policy personnel_maj on storage.objects for update to authenticated
  using (bucket_id = 'personnel' and public.est_mj());
drop policy if exists personnel_suppr on storage.objects;
create policy personnel_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'personnel' and public.est_mj());
