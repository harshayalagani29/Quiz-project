-- EXAMORA schema. Run in Supabase SQL editor. Enable Auth > Providers > Anonymous sign-ins (students) and Email (management).
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text, email text,
  role text not null default 'student' check (role in ('management','student')),
  student_id text, created_at timestamptz default now()
);

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default 'EXM-' || upper(substr(md5(random()::text),1,4)),
  title text not null, subject text, description text,
  duration_minutes int not null default 30,
  max_students int not null default 60,
  status text not null default 'draft' check (status in ('draft','live','paused','ended')),
  randomize_questions bool default true, randomize_options bool default true,
  allow_navigation bool default true, enable_fullscreen bool default true, enable_monitoring bool default true,
  start_time timestamptz, end_time timestamptz,
  created_by uuid references profiles(id), created_at timestamptz default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes on delete cascade,
  question_text text not null,
  option_a text not null, option_b text not null, option_c text not null, option_d text not null,
  marks int not null default 1, order_number int not null default 0
);
-- Correct answers live in a separate table so students can never read them.
create table question_keys (
  question_id uuid primary key references questions on delete cascade,
  correct_answer char(1) not null check (correct_answer in ('A','B','C','D'))
);

create table quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes on delete cascade,
  user_id uuid not null references auth.users,
  student_name text not null, student_id text not null,
  device_info jsonb default '{}',
  joined_at timestamptz default now(), started_at timestamptz, submitted_at timestamptz,
  status text not null default 'joined' check (status in ('joined','active','inactive','submitted')),
  last_active_at timestamptz default now(),
  score int, total_marks int, correct_count int, incorrect_count int, unanswered_count int,
  unique (quiz_id, student_id)               -- one session per student per quiz
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions on delete cascade,
  question_id uuid not null references questions on delete cascade,
  selected_answer char(1) check (selected_answer in ('A','B','C','D')),
  answered_at timestamptz default now(),
  unique (session_id, question_id)
);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions on delete cascade,
  quiz_id uuid not null references quizzes on delete cascade,
  student_id text not null,
  source text not null default 'web' check (source in ('web','android')),
  event_type text not null,  -- web: QUIZ_STARTED TAB_HIDDEN TAB_VISIBLE WINDOW_BLUR WINDOW_FOCUS FULLSCREEN_EXIT COPY PASTE CUT PRINT_SHORTCUT OFFLINE ONLINE SUBMITTED
                             -- android (future, native layer only): APP_SWITCH EXTERNAL_APP_DETECTED
  event_timestamp timestamptz default now(),
  metadata jsonb default '{}'
);
create index on quiz_sessions (quiz_id, status);
create index on activity_logs (quiz_id, event_timestamp desc);
create index on activity_logs (session_id, event_timestamp);
create index on answers (session_id);
create index on questions (quiz_id, order_number);

create or replace function is_mgmt() returns bool language sql stable security definer as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'management') $$;

create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, name, role) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name','Faculty'),
    case when new.is_anonymous then 'student' else 'management' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- RLS
alter table profiles enable row level security;       alter table quizzes enable row level security;
alter table questions enable row level security;      alter table question_keys enable row level security;
alter table quiz_sessions enable row level security;  alter table answers enable row level security;
alter table activity_logs enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid() or is_mgmt());
create policy "mgmt quizzes" on quizzes for all using (is_mgmt() and created_by = auth.uid()) with check (is_mgmt() and created_by = auth.uid());
create policy "mgmt questions" on questions for all using (is_mgmt() and exists (select 1 from quizzes q where q.id = quiz_id and q.created_by = auth.uid()));
create policy "student reads questions of joined quiz" on questions for select using (
  exists (select 1 from quiz_sessions s join quizzes q on q.id = s.quiz_id where s.quiz_id = questions.quiz_id and s.user_id = auth.uid() and q.status = 'live'));
create policy "mgmt keys" on question_keys for all using (is_mgmt() and exists (select 1 from questions x join quizzes q on q.id = x.quiz_id where x.id = question_id and q.created_by = auth.uid()));
create policy "student reads own quiz" on quizzes for select using (exists (select 1 from quiz_sessions s where s.quiz_id = quizzes.id and s.user_id = auth.uid()));
create policy "own session" on quiz_sessions for select using (user_id = auth.uid());
create policy "mgmt sessions" on quiz_sessions for select using (is_mgmt() and exists (select 1 from quizzes q where q.id = quiz_id and q.created_by = auth.uid()));
create policy "own answers" on answers for all using (exists (select 1 from quiz_sessions s where s.id = session_id and s.user_id = auth.uid() and s.status <> 'submitted'))
  with check (exists (select 1 from quiz_sessions s where s.id = session_id and s.user_id = auth.uid() and s.status <> 'submitted'));
create policy "mgmt answers" on answers for select using (is_mgmt());
create policy "own logs insert" on activity_logs for insert with check (exists (select 1 from quiz_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "mgmt logs" on activity_logs for select using (is_mgmt() and exists (select 1 from quizzes q where q.id = quiz_id and q.created_by = auth.uid()));

-- Students never write sessions directly: capacity, duplicates and timing are enforced here.
create or replace function join_quiz(p_code text, p_name text, p_student_id text, p_device jsonb default '{}')
returns uuid language plpgsql security definer as $$
declare q quizzes; s quiz_sessions; n int;
begin
  select * into q from quizzes where code = upper(p_code);
  if not found then raise exception 'INVALID_CODE'; end if;
  if q.status = 'ended' then raise exception 'QUIZ_ENDED'; end if;
  select * into s from quiz_sessions where quiz_id = q.id and student_id = p_student_id;
  if found then
    if s.user_id <> auth.uid() then raise exception 'DUPLICATE_SESSION'; end if;  -- same device/browser may resume
    return s.id;
  end if;
  select count(*) into n from quiz_sessions where quiz_id = q.id;
  if n >= q.max_students then raise exception 'QUIZ_FULL'; end if;
  insert into quiz_sessions (quiz_id, user_id, student_name, student_id, device_info)
    values (q.id, auth.uid(), p_name, p_student_id, p_device) returning * into s;
  insert into activity_logs (session_id, quiz_id, student_id, event_type) values (s.id, q.id, p_student_id, 'QUIZ_JOINED');
  return s.id;
end $$;

create or replace function start_attempt(p_session uuid) returns timestamptz language plpgsql security definer as $$
declare s quiz_sessions; q quizzes;
begin
  select * into s from quiz_sessions where id = p_session and user_id = auth.uid();
  if not found then raise exception 'NO_SESSION'; end if;
  select * into q from quizzes where id = s.quiz_id;
  if q.status = 'paused' then raise exception 'QUIZ_PAUSED'; end if;
  if q.status <> 'live' then raise exception 'QUIZ_NOT_STARTED'; end if;
  update quiz_sessions set started_at = coalesce(started_at, now()), status = 'active', last_active_at = now() where id = p_session;
  return (select started_at + make_interval(mins => q.duration_minutes) from quiz_sessions where id = p_session); -- server-side deadline
end $$;

create or replace function submit_quiz(p_session uuid) returns quiz_sessions language plpgsql security definer as $$
declare s quiz_sessions; q quizzes; tot int; got int; ok int; bad int; total_q int;
begin
  select * into s from quiz_sessions where id = p_session and user_id = auth.uid();
  if not found then raise exception 'NO_SESSION'; end if;
  if s.status = 'submitted' then return s; end if;
  select * into q from quizzes where id = s.quiz_id;
  select count(*), coalesce(sum(marks),0) into total_q, tot from questions where quiz_id = q.id;
  select coalesce(sum(qs.marks) filter (where a.selected_answer = k.correct_answer),0),
         count(*) filter (where a.selected_answer = k.correct_answer),
         count(*) filter (where a.selected_answer is not null and a.selected_answer <> k.correct_answer)
    into got, ok, bad
    from answers a join questions qs on qs.id = a.question_id join question_keys k on k.question_id = qs.id where a.session_id = p_session;
  update quiz_sessions set status='submitted', submitted_at=now(), score=got, total_marks=tot,
    correct_count=ok, incorrect_count=bad, unanswered_count=total_q-ok-bad where id = p_session returning * into s;
  insert into activity_logs (session_id, quiz_id, student_id, event_type) values (p_session, q.id, s.student_id, 'SUBMITTED');
  return s;
end $$;

create or replace function heartbeat(p_session uuid, p_status text) returns void language sql security definer as $$
  update quiz_sessions set last_active_at = now(), status = p_status where id = p_session and user_id = auth.uid() and status <> 'submitted' and p_status in ('active','inactive');
$$;

alter publication supabase_realtime add table quiz_sessions, activity_logs, quizzes;
