-- 배우의 대본 저장소: 내 기록(보관함) 표
-- Supabase 대시보드 → SQL Editor → New query 에 이 내용을 통째로 붙여넣고 Run 을 누르세요.
-- 한 번만 실행하면 돼요. (여러 번 눌러도 오류 없이 넘어가게 만들었어요)

create table if not exists public.records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  service     text not null check (service in ('dialect', 'analyze', 'note')),  -- 사투리 코치 / 대본 분석 / 연기 노트
  title       text not null default '',
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists records_user_service_idx on public.records (user_id, service, updated_at desc);

-- 수정할 때 updated_at 을 자동으로 바꿔요
create or replace function public.records_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records
  for each row execute function public.records_touch();

-- 행 보안(RLS): 로그인한 사람은 "자기 기록"만 보고, 쓰고, 고치고, 지울 수 있어요
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records for select to authenticated using (user_id = auth.uid());
drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "records_delete_own" on public.records;
create policy "records_delete_own" on public.records for delete to authenticated using (user_id = auth.uid());
