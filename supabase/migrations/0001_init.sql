-- Rehearse — initial schema
-- Roles, difficulties and categories are constrained to a fixed vocabulary
-- shared with the web app and API (see apps/web/src/types and apps/api/app/schemas).

create extension if not exists "pgcrypto";

-- ─── profiles ────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  target_role text,
  answer_cap_s integer not null default 120 check (answer_cap_s in (60, 120, 180, 300)),
  voice_name text,
  voice_rate numeric(3, 2) not null default 1.0 check (voice_rate between 0.5 and 2.0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by their owner"
  on public.profiles for select
  using (auth.uid () = id);

create policy "profiles are insertable by their owner"
  on public.profiles for insert
  with check (auth.uid () = id);

create policy "profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid () = id)
  with check (auth.uid () = id);

-- Creates a profile row automatically when a new auth user signs up.
create function public.handle_new_user () returns trigger
set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users for each row
execute function public.handle_new_user ();

-- ─── questions ───────────────────────────────────────────────────────────

create table public.questions (
  id uuid primary key default gen_random_uuid (),
  role text not null check (
    role in (
      'software-engineer',
      'frontend',
      'backend',
      'data-scientist',
      'ml-engineer',
      'product-manager',
      'ui-ux-designer',
      'hr-general'
    )
  ),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  category text not null check (category in ('behavioral', 'technical', 'situational')),
  text text not null,
  is_active boolean not null default true
);

create index questions_role_difficulty_idx on public.questions (role, difficulty)
where
  is_active;

alter table public.questions enable row level security;

create policy "questions are readable by authenticated users"
  on public.questions for select
  to authenticated
  using (is_active);

-- ─── sessions ────────────────────────────────────────────────────────────

create table public.sessions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index sessions_user_id_created_at_idx on public.sessions (user_id, started_at desc);

alter table public.sessions enable row level security;

create policy "sessions are managed by their owner"
  on public.sessions for all
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ─── answers ─────────────────────────────────────────────────────────────

create table public.answers (
  id uuid primary key default gen_random_uuid (),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid references public.questions (id) on delete set null,
  question_text text not null,
  transcript text not null,
  words jsonb not null default '[]'::jsonb,
  duration_s numeric(6, 2) not null,
  wpm numeric(6, 2) not null,
  filler_count integer not null default 0,
  filler_breakdown jsonb not null default '{}'::jsonb,
  long_pauses integer not null default 0,
  rambling text,
  star jsonb,
  clarity integer check (clarity between 0 and 10),
  on_topic boolean,
  feedback jsonb,
  sample_answer text,
  created_at timestamptz not null default now()
);

create index answers_user_id_created_at_idx on public.answers (user_id, created_at desc);

create index answers_session_id_idx on public.answers (session_id);

alter table public.answers enable row level security;

create policy "answers are managed by their owner"
  on public.answers for all
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ─── progress view ───────────────────────────────────────────────────────

create view public.progress
with
  (security_invoker = true) as
select
  s.id as session_id,
  s.user_id,
  s.role,
  s.difficulty,
  s.started_at,
  count(a.id) as answer_count,
  avg(a.wpm) as avg_wpm,
  avg(a.filler_count) as avg_filler_count,
  avg(a.clarity) as avg_clarity,
  avg(((a.star ->> 's')::numeric + (a.star ->> 't')::numeric + (a.star ->> 'a')::numeric + (a.star ->> 'r')::numeric) / 4) as avg_star
from
  public.sessions s
  left join public.answers a on a.session_id = s.id
group by
  s.id;
