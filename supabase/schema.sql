-- =====================================================================
--  Archives des cellules — schéma de la base Supabase
--  À coller EN ENTIER dans Supabase > SQL Editor > New query, puis « Run ».
--  Le script peut être relancé sans danger (il ne supprime aucune donnée).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists public.groupes (
  id               text primary key,
  nom              text not null,
  monde            text not null default '',
  prochaine_seance timestamptz
);
insert into public.groupes (id, nom, monde) values
  ('g1', 'Groupe de 4', 'Monde Foundry 1'),
  ('g2', 'Groupe de 3', 'Monde Foundry 2')
on conflict (id) do nothing;

create table if not exists public.profils (
  id      uuid primary key references auth.users(id) on delete cascade,
  discord text not null default '',
  avatar  text,
  role    text not null default 'attente' check (role in ('mj','joueur','attente','refuse')),
  groupe  text references public.groupes(id) on delete set null,
  cree_le timestamptz not null default now()
);

create table if not exists public.agents (
  id         uuid primary key default gen_random_uuid(),
  groupe     text not null references public.groupes(id) on delete cascade,
  joueur     uuid references public.profils(id) on delete set null,
  foundry_id text unique,
  data       jsonb not null default '{}'::jsonb,
  portrait   text,
  modifie_le timestamptz not null default now()
);

-- SAN et seuil de rupture : table séparée, lisible par le MJ seulement
create table if not exists public.agents_secret (
  agent   uuid primary key references public.agents(id) on delete cascade,
  san     int not null default 0,
  san_max int not null default 99,
  seuil   int not null default 0
);

create table if not exists public.operations (
  id      uuid primary key default gen_random_uuid(),
  groupe  text not null references public.groupes(id) on delete cascade,
  titre   text not null,
  statut  text not null default 'verrouillee' check (statut in ('verrouillee','en_cours','terminee')),
  periode text not null default '',
  resume  text not null default '',
  ordre   int  not null default 0,
  cree_le timestamptz not null default now()
);

create table if not exists public.seances (
  id            uuid primary key default gen_random_uuid(),
  operation     uuid not null references public.operations(id) on delete cascade,
  numero        int  not null default 1,
  date          date,
  compte_rendu  text not null default '',
  cree_le       timestamptz not null default now()
);

create table if not exists public.aides (
  id        uuid primary key default gen_random_uuid(),
  groupe    text not null references public.groupes(id) on delete cascade,
  operation uuid references public.operations(id) on delete set null,
  titre     text not null,
  image     text,
  visible   boolean not null default false,
  cree_le   timestamptz not null default now()
);

create table if not exists public.notes_communes (
  groupe      text primary key references public.groupes(id) on delete cascade,
  texte       text not null default '',
  modifie_par text not null default '',
  modifie_le  timestamptz not null default now()
);

create table if not exists public.notes_perso (
  joueur     uuid primary key default auth.uid() references public.profils(id) on delete cascade,
  texte      text not null default '',
  modifie_le timestamptz not null default now()
);

-- ------------------------------------------------------- fonctions utiles

create or replace function public.est_mj() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'mj')
$$;

create or replace function public.mon_groupe() returns text
language sql stable security definer set search_path = public as $$
  select groupe from public.profils where id = auth.uid() and role = 'joueur'
$$;

-- Nouveau compte Discord : profil créé automatiquement.
-- Le TOUT PREMIER compte devient MJ, tous les suivants sont « en attente ».
create or replace function public.nouveau_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, discord, avatar, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->'custom_claims'->>'global_name',
             new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name', 'inconnu'),
    new.raw_user_meta_data->>'avatar_url',
    case when exists (select 1 from public.profils where role = 'mj') then 'attente' else 'mj' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.nouveau_profil();

-- Pseudo et avatar Discord mis à jour à chaque connexion
create or replace function public.maj_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profils set
    discord = coalesce(new.raw_user_meta_data->'custom_claims'->>'global_name',
                       new.raw_user_meta_data->>'full_name',
                       new.raw_user_meta_data->>'name', discord),
    avatar  = coalesce(new.raw_user_meta_data->>'avatar_url', avatar)
  where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of raw_user_meta_data on auth.users
  for each row execute function public.maj_profil();

-- Comptes déjà existants avant ce script (s'il y en a) : le plus ancien devient MJ
insert into public.profils (id, discord, avatar, role)
select u.id,
       coalesce(u.raw_user_meta_data->'custom_claims'->>'global_name', u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'inconnu'),
       u.raw_user_meta_data->>'avatar_url', 'attente'
from auth.users u
on conflict (id) do nothing;
update public.profils set role = 'mj'
where not exists (select 1 from public.profils where role = 'mj')
  and id = (select id from public.profils order by cree_le, id limit 1);

-- Chaque nouvel agent reçoit sa ligne SAN (calculée depuis le POU si présent)
create or replace function public.nouvel_agent_secret() returns trigger
language plpgsql security definer set search_path = public as $$
declare pou int := coalesce((new.data->'stats'->>'POU')::int, 10);
begin
  insert into public.agents_secret (agent, san, san_max, seuil)
  values (new.id, pou * 5, 99, pou * 4)
  on conflict (agent) do nothing;
  return new;
end $$;

drop trigger if exists on_agent_created on public.agents;
create trigger on_agent_created after insert on public.agents
  for each row execute function public.nouvel_agent_secret();

-- MJ : rattacher un compte Discord à un agent (et donc à son groupe)
create or replace function public.accrediter(p_profil uuid, p_agent uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g text;
begin
  if not public.est_mj() then raise exception 'Réservé au MJ'; end if;
  select groupe into g from public.agents where id = p_agent;
  if g is null then raise exception 'Agent inconnu'; end if;
  update public.agents set joueur = null where joueur = p_profil;
  update public.agents set joueur = p_profil where id = p_agent;
  update public.profils set role = 'joueur', groupe = g where id = p_profil and role <> 'mj';
end $$;

-- MJ : retirer l'accès d'un joueur (retour en attente, ou refus définitif)
create or replace function public.retirer_acces(p_profil uuid, p_refuser boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_mj() then raise exception 'Réservé au MJ'; end if;
  update public.agents set joueur = null where joueur = p_profil;
  update public.profils set role = case when p_refuser then 'refuse' else 'attente' end, groupe = null
  where id = p_profil and role <> 'mj';
end $$;

-- MJ : import des fiches depuis Foundry (mise à jour si l'id Foundry existe déjà)
create or replace function public.importer_agents(p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; aid uuid; n int := 0;
begin
  if not public.est_mj() then raise exception 'Réservé au MJ'; end if;
  for x in select * from jsonb_array_elements(p) loop
    insert into public.agents (groupe, foundry_id, data, portrait)
    values (x->>'groupe', nullif(x->>'foundry_id',''), coalesce(x->'data','{}'::jsonb), x->>'portrait')
    on conflict (foundry_id) do update
      set data = excluded.data, groupe = excluded.groupe,
          portrait = coalesce(excluded.portrait, public.agents.portrait), modifie_le = now()
    returning id into aid;
    if x ? 'san' then
      insert into public.agents_secret (agent, san, san_max, seuil)
      values (aid, (x->>'san')::int, coalesce((x->>'san_max')::int, 99), coalesce((x->>'seuil')::int, 0))
      on conflict (agent) do update set san = excluded.san, san_max = excluded.san_max, seuil = excluded.seuil;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ------------------------------------------------------------------ droits

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- Les profils ne se modifient que par les fonctions ci-dessus
revoke insert, update, delete on public.profils from authenticated;
-- Un joueur ne peut changer que le contenu de sa fiche, pas son groupe ni son joueur
revoke update on public.agents from authenticated;
grant update (data, portrait, modifie_le) on public.agents to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.est_mj(), public.mon_groupe(),
  public.accrediter(uuid, uuid), public.retirer_acces(uuid, boolean),
  public.importer_agents(jsonb) to authenticated;

alter table public.groupes        enable row level security;
alter table public.profils        enable row level security;
alter table public.agents         enable row level security;
alter table public.agents_secret  enable row level security;
alter table public.operations     enable row level security;
alter table public.seances        enable row level security;
alter table public.aides          enable row level security;
alter table public.notes_communes enable row level security;
alter table public.notes_perso    enable row level security;

drop policy if exists groupes_lire on public.groupes;
create policy groupes_lire on public.groupes for select to authenticated
  using (public.est_mj() or id = public.mon_groupe());
drop policy if exists groupes_mj on public.groupes;
create policy groupes_mj on public.groupes for all to authenticated
  using (public.est_mj()) with check (public.est_mj());

drop policy if exists profils_lire on public.profils;
create policy profils_lire on public.profils for select to authenticated
  using (id = auth.uid() or public.est_mj() or (groupe is not null and groupe = public.mon_groupe()));

drop policy if exists agents_lire on public.agents;
create policy agents_lire on public.agents for select to authenticated
  using (public.est_mj() or groupe = public.mon_groupe());
drop policy if exists agents_modifier on public.agents;
create policy agents_modifier on public.agents for update to authenticated
  using (public.est_mj() or joueur = auth.uid())
  with check (public.est_mj() or joueur = auth.uid());
drop policy if exists agents_creer on public.agents;
create policy agents_creer on public.agents for insert to authenticated with check (public.est_mj());
drop policy if exists agents_suppr on public.agents;
create policy agents_suppr on public.agents for delete to authenticated using (public.est_mj());

drop policy if exists secret_mj on public.agents_secret;
create policy secret_mj on public.agents_secret for all to authenticated
  using (public.est_mj()) with check (public.est_mj());

drop policy if exists operations_lire on public.operations;
create policy operations_lire on public.operations for select to authenticated
  using (public.est_mj() or (groupe = public.mon_groupe() and statut <> 'verrouillee'));
drop policy if exists operations_mj on public.operations;
create policy operations_mj on public.operations for all to authenticated
  using (public.est_mj()) with check (public.est_mj());

drop policy if exists seances_lire on public.seances;
create policy seances_lire on public.seances for select to authenticated
  using (public.est_mj() or exists (select 1 from public.operations o
         where o.id = operation and o.groupe = public.mon_groupe() and o.statut <> 'verrouillee'));
drop policy if exists seances_mj on public.seances;
create policy seances_mj on public.seances for all to authenticated
  using (public.est_mj()) with check (public.est_mj());

drop policy if exists aides_lire on public.aides;
create policy aides_lire on public.aides for select to authenticated
  using (public.est_mj() or (visible and groupe = public.mon_groupe() and
         (operation is null or exists (select 1 from public.operations o
           where o.id = operation and o.statut <> 'verrouillee'))));
drop policy if exists aides_mj on public.aides;
create policy aides_mj on public.aides for all to authenticated
  using (public.est_mj()) with check (public.est_mj());

drop policy if exists notes_communes_groupe on public.notes_communes;
create policy notes_communes_groupe on public.notes_communes for all to authenticated
  using (public.est_mj() or groupe = public.mon_groupe())
  with check (public.est_mj() or groupe = public.mon_groupe());

drop policy if exists notes_perso_soi on public.notes_perso;
create policy notes_perso_soi on public.notes_perso for all to authenticated
  using (joueur = auth.uid()) with check (joueur = auth.uid());

-- --------------------------------------------- stockage des aides de jeu

insert into storage.buckets (id, name, public) values ('aides', 'aides', false)
on conflict (id) do nothing;

drop policy if exists aides_fichiers_lire on storage.objects;
create policy aides_fichiers_lire on storage.objects for select to authenticated
  using (bucket_id = 'aides' and exists (select 1 from public.aides a
         where a.id::text = (storage.foldername(name))[1]));
drop policy if exists aides_fichiers_ajout on storage.objects;
create policy aides_fichiers_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'aides' and public.est_mj());
drop policy if exists aides_fichiers_maj on storage.objects;
create policy aides_fichiers_maj on storage.objects for update to authenticated
  using (bucket_id = 'aides' and public.est_mj());
drop policy if exists aides_fichiers_suppr on storage.objects;
create policy aides_fichiers_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'aides' and public.est_mj());

-- ---------------------------------------------------------- migrations
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
