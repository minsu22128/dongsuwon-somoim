-- =====================================================================
--  동수원교회 소모임 앱 — Supabase 데이터베이스 설정
--  Supabase 대시보드 → SQL Editor 에 그대로 붙여넣고 RUN 하세요.
-- =====================================================================

-- 1) 프로필 (사용자 이름)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- 2) 전체 관리자 명단 (여기에 user_id 가 있으면 모든 소모임 관리 가능)
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- 3) 소모임
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text default 'oneday',         -- oneday | club | challenge
  tag text,
  place text,
  meet_date date,
  meet_time text,
  capacity int default 30,
  image text,                          -- data URL 또는 외부 이미지 URL
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 4) 소모임 멤버
create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  is_leader boolean default false,
  joined_at timestamptz default now(),
  unique (group_id, user_id)
);

-- 5) 출석 (있으면 출석, 없으면 결석)
create table if not exists attendance (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  created_at timestamptz default now(),
  primary key (group_id, user_id, date)
);

-- 6) 소식
create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  author_id uuid references auth.users(id),
  title text not null,
  body text,
  created_at timestamptz default now()
);

-- =====================================================================
--  보안: Row Level Security (RLS)
--  → 서버가 "이 사람이 이 작업을 할 권리가 있는지" 매번 검사합니다.
-- =====================================================================

-- 헬퍼: 현재 사용자가 전체 관리자인가?
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;

-- 헬퍼: 현재 사용자가 해당 소모임의 리더인가?
create or replace function is_group_leader(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from group_members
    where group_id = gid and user_id = auth.uid() and is_leader = true
  );
$$;

alter table profiles        enable row level security;
alter table admins          enable row level security;
alter table groups          enable row level security;
alter table group_members   enable row level security;
alter table attendance      enable row level security;
alter table notices         enable row level security;

-- profiles: 누구나 이름을 읽을 수 있고(멤버 표시용), 본인 것만 수정
create policy "profiles read"   on profiles for select using (true);
create policy "profiles upsert" on profiles for insert with check (auth.uid() = id);
create policy "profiles update" on profiles for update using (auth.uid() = id);

-- admins: 본인이 관리자인지 확인만 가능(목록 노출 방지)
create policy "admins self read" on admins for select using (user_id = auth.uid());

-- groups: 로그인한 사람은 모두 조회 / 생성 / 리더·관리자만 수정·삭제
create policy "groups read"   on groups for select using (auth.role() = 'authenticated');
create policy "groups insert" on groups for insert with check (auth.uid() = created_by);
create policy "groups update" on groups for update using (is_group_leader(id) or is_admin());
create policy "groups delete" on groups for delete using (is_group_leader(id) or is_admin());

-- group_members: 조회는 모두 / 본인 가입·해지 / 리더·관리자는 멤버 관리
create policy "members read"   on group_members for select using (auth.role() = 'authenticated');
create policy "members join"   on group_members for insert with check (
  user_id = auth.uid() or is_group_leader(group_id) or is_admin()
);
create policy "members leave"  on group_members for delete using (
  user_id = auth.uid() or is_group_leader(group_id) or is_admin()
);
create policy "members update" on group_members for update using (
  is_group_leader(group_id) or is_admin()
);

-- attendance: 멤버는 조회 / 본인 출석 또는 리더·관리자가 기록
create policy "att read"   on attendance for select using (auth.role() = 'authenticated');
create policy "att insert" on attendance for insert with check (
  user_id = auth.uid() or is_group_leader(group_id) or is_admin()
);
create policy "att delete" on attendance for delete using (
  user_id = auth.uid() or is_group_leader(group_id) or is_admin()
);

-- notices: 조회는 모두 / 멤버 작성 / 작성자·리더·관리자 삭제
create policy "notice read"   on notices for select using (auth.role() = 'authenticated');
create policy "notice insert" on notices for insert with check (author_id = auth.uid());
create policy "notice delete" on notices for delete using (
  author_id = auth.uid() or is_group_leader(group_id) or is_admin()
);

-- =====================================================================
--  실시간 동기화 켜기 (모두가 같은 화면을 실시간으로 보게)
-- =====================================================================
alter publication supabase_realtime add table groups;
alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table attendance;
alter publication supabase_realtime add table notices;

-- =====================================================================
--  나를 전체 관리자로 등록하는 법:
--  1) 앱에 한 번 접속해서 사용자(익명 로그인)를 생성하세요.
--  2) Supabase → Authentication → Users 에서 내 User UID 를 복사.
--  3) 아래 줄의 '여기에-내-UID' 를 바꿔서 한 번 실행하세요.
-- =====================================================================
-- insert into admins (user_id) values ('여기에-내-UID');
