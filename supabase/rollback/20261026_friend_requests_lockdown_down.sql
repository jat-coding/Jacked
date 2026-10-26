-- Undo 20261026_friend_requests_lockdown.sql (restores the sender's ability to set
-- from_code/to_code/status freely and self-accept -- re-opens the forced-friendship hole,
-- do not run on the live project without a reason).
drop policy if exists fr_write  on public.friend_requests;
drop policy if exists fr_update on public.friend_requests;
create policy fr_write  on public.friend_requests for insert to authenticated
  with check (public.owns_code(from_code));
create policy fr_update on public.friend_requests for update to authenticated
  using (public.owns_code(from_code) or public.owns_code(to_code))
  with check (public.owns_code(from_code) or public.owns_code(to_code));
revoke update (status) on public.friend_requests from authenticated;
grant update on public.friend_requests to authenticated;
alter table public.friend_requests drop constraint if exists friend_requests_status_check;
alter table public.friend_requests drop constraint if exists friend_requests_from_ne_to;
