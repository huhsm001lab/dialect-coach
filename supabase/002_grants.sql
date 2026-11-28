-- 2026-11-28 실행함 (기록용).
-- 이 Supabase 프로젝트는 새 표를 만들어도 로그인한 사용자(authenticated)에게 권한을 자동으로 주지 않아서,
-- 001_records.sql 다음에 이 한 줄을 실행해야 저장·불러오기가 된다. (행 보안 RLS 때문에 여전히 본인 기록만 보임)
-- 로그인하지 않은 사람(anon)에게는 권한을 주지 않는다.
grant select, insert, update, delete on public.records to authenticated;
