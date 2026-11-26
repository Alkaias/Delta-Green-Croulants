-- Migration 02 : illustrations des opérations et des rapports (à coller dans SQL Editor puis Run ; sans danger si relancé)
create table if not exists public.illustrations (
  id        uuid primary key default gen_random_uuid(),
  operation uuid not null references public.operations(id) on delete cascade,
  seance    uuid references public.seances(id) on delete cascade,
  image     text,
  legende   text not null default '',
  ordre     int  not null default 0,
  cree_le   timestamptz not null default now()
);
alter table public.illustrations enable row level security;
grant select, insert, update, delete on public.illustrations to authenticated;
revoke all on public.illustrations from anon;
-- visibles dès que l'opération l'est (une opération verrouillée reste invisible aux joueurs)
drop policy if exists illustrations_lire on public.illustrations;
create policy illustrations_lire on public.illustrations for select to authenticated
  using (exists (select 1 from public.operations o where o.id = operation));
drop policy if exists illustrations_mj on public.illustrations;
create policy illustrations_mj on public.illustrations for all to authenticated
  using (public.est_mj()) with check (public.est_mj());

insert into storage.buckets (id, name, public) values ('illustrations', 'illustrations', false)
on conflict (id) do nothing;
drop policy if exists illustrations_fichiers_lire on storage.objects;
create policy illustrations_fichiers_lire on storage.objects for select to authenticated
  using (bucket_id = 'illustrations' and exists (select 1 from public.illustrations i
         where i.id::text = (storage.foldername(name))[1]));
drop policy if exists illustrations_fichiers_ajout on storage.objects;
create policy illustrations_fichiers_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'illustrations' and public.est_mj());
drop policy if exists illustrations_fichiers_maj on storage.objects;
create policy illustrations_fichiers_maj on storage.objects for update to authenticated
  using (bucket_id = 'illustrations' and public.est_mj());
drop policy if exists illustrations_fichiers_suppr on storage.objects;
create policy illustrations_fichiers_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'illustrations' and public.est_mj());
