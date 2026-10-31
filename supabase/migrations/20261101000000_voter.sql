-- Run once in a fresh Supabase project. No browser role has access to voting data.
begin;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 100),
  status text not null default 'draft' check (status in ('draft', 'open', 'completed')),
  rules_version integer not null default 1 check (rules_version = 1),
  created_at timestamptz not null default now()
);
create table public.members (
  id uuid primary key,
  event_id uuid not null references public.events(id),
  name text not null check (length(trim(name)) between 1 and 60),
  role text not null check (role in ('participant', 'jury')),
  position integer not null check (position between 0 and 5),
  code_hash text not null unique check (length(code_hash) = 64),
  unique (id, event_id), unique (event_id, position),
  check ((position < 4 and role = 'participant') or (position >= 4 and role = 'jury'))
);
create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  voter_id uuid not null,
  target_id uuid not null,
  scores integer[] not null,
  weighted_total integer generated always as (
    scores[1]*3 + scores[2]*3 + scores[3]*2 + scores[4]*2 + scores[5] + scores[6]
  ) stored,
  created_at timestamptz not null default now(),
  foreign key (voter_id, event_id) references public.members(id, event_id),
  foreign key (target_id, event_id) references public.members(id, event_id),
  unique (voter_id, target_id),
  check (voter_id <> target_id),
  check (cardinality(scores) = 6 and array_ndims(scores) = 1 and array_length(scores, 1) = 6 and array_lower(scores, 1) = 1),
  check (array_position(scores, null) is null and 1 <= all(scores) and 5 >= all(scores))
);
create index ballots_event_idx on public.ballots(event_id);
create index members_event_idx on public.members(event_id);
create table public.login_limits (
  key text primary key,
  bucket timestamptz not null,
  attempts integer not null
);

alter table public.events enable row level security;
alter table public.members enable row level security;
alter table public.ballots enable row level security;
alter table public.login_limits enable row level security;
revoke all on public.events, public.members, public.ballots, public.login_limits from public, anon, authenticated, service_role;
grant select on public.events, public.members, public.ballots to service_role;

-- A persistent atomic rate limit shared by all Vercel instances.
create function public.voter_login_attempt(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer; current_bucket timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 15) * interval '15 minutes';
begin
  insert into public.login_limits(key, bucket, attempts) values(p_key, current_bucket, 1)
  on conflict (key) do update set
    attempts = case when public.login_limits.bucket = current_bucket then least(public.login_limits.attempts + 1, 1000) else 1 end,
    bucket = current_bucket
  returning attempts into n;
  delete from public.login_limits where bucket < now() - interval '1 day';
  return n <= 15;
end $$;

create function public.voter_create_event(p_event_id uuid, p_title text, p_members jsonb, p_actor uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  -- Serializes initial setup and the creation of subsequent events.
  perform pg_advisory_xact_lock(681925);
  if exists(select 1 from public.events) then
    if not exists(select 1 from public.members where id = p_actor and role = 'jury') then
      raise exception 'FORBIDDEN';
    end if;
    if exists(select 1 from public.events where status <> 'completed') then
      raise exception 'EVENT_IN_PROGRESS';
    end if;
  end if;
  if p_members is null or jsonb_typeof(p_members) is distinct from 'array' then
    raise exception 'INVALID_MEMBERS';
  end if;
  if jsonb_array_length(p_members) <> 6 then raise exception 'INVALID_MEMBERS'; end if;
  insert into public.events(id, title) values(p_event_id, trim(p_title));
  for item in select * from jsonb_array_elements(p_members) loop
    insert into public.members(id, event_id, name, role, position, code_hash)
    values((item->>'id')::uuid, p_event_id, trim(item->>'name'), item->>'role', (item->>'position')::integer, item->>'code_hash');
  end loop;
end $$;

create function public.voter_update_draft(p_actor uuid, p_title text, p_names jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare e uuid; state text; item jsonb;
begin
  select event_id into e from public.members where id = p_actor and role = 'jury';
  if e is null then raise exception 'FORBIDDEN'; end if;
  select status into state from public.events where id = e for update;
  if state <> 'draft' then raise exception 'EVENT_LOCKED'; end if;
  if p_names is null or jsonb_typeof(p_names) is distinct from 'array' then raise exception 'INVALID_MEMBERS'; end if;
  if jsonb_array_length(p_names) <> 6 then raise exception 'INVALID_MEMBERS'; end if;
  if (select count(distinct (v->>'id')) from jsonb_array_elements(p_names) v) <> 6 then raise exception 'INVALID_MEMBERS'; end if;
  update public.events set title = trim(p_title) where id = e;
  for item in select * from jsonb_array_elements(p_names) loop
    update public.members set name = trim(item->>'name') where id = (item->>'id')::uuid and event_id = e;
    if not found then raise exception 'INVALID_MEMBERS'; end if;
  end loop;
end $$;

-- Codes may be reissued only before voting; an existing jury session remains valid.
create function public.voter_rotate_codes(p_actor uuid, p_codes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare e uuid; state text; item jsonb;
begin
  select event_id into e from public.members where id = p_actor and role = 'jury';
  if e is null then raise exception 'FORBIDDEN'; end if;
  select status into state from public.events where id = e for update;
  if state <> 'draft' then raise exception 'EVENT_LOCKED'; end if;
  if p_codes is null or jsonb_typeof(p_codes) is distinct from 'array' then raise exception 'INVALID_MEMBERS'; end if;
  if jsonb_array_length(p_codes) <> 6 then raise exception 'INVALID_MEMBERS'; end if;
  if (select count(distinct (v->>'id')) from jsonb_array_elements(p_codes) v) <> 6 then raise exception 'INVALID_MEMBERS'; end if;
  for item in select * from jsonb_array_elements(p_codes) loop
    update public.members set code_hash = item->>'code_hash' where id = (item->>'id')::uuid and event_id = e;
    if not found then raise exception 'INVALID_MEMBERS'; end if;
  end loop;
end $$;

create function public.voter_start_event(p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e uuid; state text;
begin
  select event_id into e from public.members where id = p_actor and role = 'jury';
  if e is null then raise exception 'FORBIDDEN'; end if;
  select status into state from public.events where id = e for update;
  if state <> 'draft' then raise exception 'EVENT_LOCKED'; end if;
  if (select count(*) from public.members where event_id = e) <> 6 then raise exception 'INVALID_MEMBERS'; end if;
  update public.events set status = 'open' where id = e;
end $$;

create function public.voter_submit_ballot(p_voter_id uuid, p_target_id uuid, p_scores integer[])
returns void language plpgsql security definer set search_path = '' as $$
declare e uuid; state text;
begin
  select event_id into e from public.members where id = p_voter_id;
  if e is null then raise exception 'FORBIDDEN'; end if;
  -- Serializes submissions with status changes. The twentieth ballot and completion commit together.
  select status into state from public.events where id = e for update;
  if state <> 'open' then raise exception 'VOTING_CLOSED'; end if;
  if not exists(select 1 from public.members where id = p_target_id and event_id = e and role = 'participant') then
    raise exception 'INVALID_TARGET';
  end if;
  insert into public.ballots(event_id, voter_id, target_id, scores) values(e, p_voter_id, p_target_id, p_scores);
  if (select count(*) from public.ballots where event_id = e) = 20 then
    update public.events set status = 'completed' where id = e;
  end if;
end $$;

create function public.voter_immutable_ballot() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'BALLOT_IMMUTABLE'; end $$;
create trigger ballots_immutable before update or delete on public.ballots for each row execute function public.voter_immutable_ballot();

-- Results are aggregated inside Postgres, with exact numeric arithmetic and no voter identities.
create function public.voter_results(p_actor uuid)
returns table(id uuid, name text, jury numeric, peers numeric, total numeric, rank bigint)
language plpgsql security definer set search_path = '' as $$
declare e uuid;
begin
  select event_id into e from public.members where public.members.id = p_actor and role = 'jury';
  if e is null then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.events where public.events.id = e and status = 'completed') then
    raise exception 'RESULTS_LOCKED';
  end if;
  return query
  with sums as (
    select t.id, t.name,
      sum(b.weighted_total) filter (where v.role = 'jury') as jury_sum,
      sum(b.weighted_total) filter (where v.role = 'participant') as peer_sum
    from public.members t
    join public.ballots b on b.target_id = t.id
    join public.members v on v.id = b.voter_id
    where t.event_id = e and t.role = 'participant'
    group by t.id, t.name
  ), ranked as (
    -- Common denominator 60: 70% * jury_sum/2 + 30% * peer_sum/3.
    -- Integer numerator avoids repeating decimal rounding changing ties.
    select s.*, (21*s.jury_sum + 6*s.peer_sum) as numerator from sums s
  )
  select r.id, r.name, r.jury_sum::numeric/2, r.peer_sum::numeric/3,
    r.numerator::numeric/60,
    rank() over(order by r.numerator desc, r.jury_sum desc)
  from ranked r order by r.numerator desc, r.jury_sum desc, r.name;
end $$;

revoke all on function public.voter_login_attempt(text), public.voter_create_event(uuid,text,jsonb,uuid),
  public.voter_update_draft(uuid,text,jsonb), public.voter_rotate_codes(uuid,jsonb),
  public.voter_start_event(uuid), public.voter_submit_ballot(uuid,uuid,integer[]),
  public.voter_immutable_ballot(), public.voter_results(uuid) from public, anon, authenticated;
grant execute on function public.voter_login_attempt(text), public.voter_create_event(uuid,text,jsonb,uuid),
  public.voter_update_draft(uuid,text,jsonb), public.voter_rotate_codes(uuid,jsonb),
  public.voter_start_event(uuid), public.voter_submit_ballot(uuid,uuid,integer[]), public.voter_results(uuid) to service_role;

commit;
