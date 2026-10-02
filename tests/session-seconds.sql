-- Transaction-only fixture: no existing users or sessions are touched.
begin;
do $test$
declare
  fixture_user uuid := gen_random_uuid();
  session_id uuid;
  seconds integer;
  result jsonb;
  repeated jsonb;
  expected_minutes integer := 0;
  daily_minutes integer;
  saved_seconds integer;
  gold_before integer;
  gold_after integer;
begin
  insert into auth.users(id, raw_user_meta_data) values (fixture_user, '{"full_name":"Session contract test"}'::jsonb);
  perform set_config('request.jwt.claim.sub', fixture_user::text, true);
  foreach seconds in array array[0, 28801, 28859] loop
    begin
      perform public.start_activity_session(seconds);
      raise exception 'Invalid duration accepted: %', seconds;
    exception when others then
      if sqlerrm <> 'Session duration must be between 1 second and 8 hours' then raise; end if;
    end;
  end loop;
  foreach seconds in array array[1, 30, 60, 930, 28800] loop
    session_id := public.start_activity_session(seconds, 'other');
    perform public.pause_activity_session(session_id);
    select target_duration_seconds into saved_seconds from public.activity_sessions where id=session_id;
    if saved_seconds <> seconds then raise exception 'Pause lost duration'; end if;
    perform public.resume_activity_session(session_id);
    -- Simulate elapsed wall time, confined to this transaction's synthetic user.
    update public.activity_sessions set elapsed_seconds=seconds, status='paused', last_resumed_at=null
      where id=session_id and user_id=fixture_user;
    result := public.complete_activity_session(session_id);
    if (result->>'duration_seconds')::integer <> seconds
       or (result->>'minutes')::integer <> seconds / 60
       or (result->>'xp_earned')::integer <> seconds / 60
       or (result->>'gold_earned')::integer <> (seconds / 60) * 5 then
      raise exception 'Incorrect duration or rewards: %', result;
    end if;
    select gold into gold_before from public.profiles where id=fixture_user;
    repeated := public.complete_activity_session(session_id);
    select gold into gold_after from public.profiles where id=fixture_user;
    if not (repeated->>'already_completed')::boolean or gold_before <> gold_after
       or (repeated->>'duration_seconds')::integer <> seconds
       or (repeated->>'minutes')::integer <> seconds / 60 then raise exception 'Duplicate completion failed'; end if;
    expected_minutes := expected_minutes + seconds / 60;
  end loop;
  select sum(completed_minutes) into daily_minutes from public.daily_progress where user_id=fixture_user;
  if daily_minutes <> expected_minutes then raise exception 'Incorrect daily progress'; end if;
  session_id := public.start_activity_session(930);
  perform public.cancel_activity_session(session_id);
  if not exists(select 1 from public.activity_sessions where id=session_id and status='cancelled' and target_duration_seconds=930 and xp_earned=0) then raise exception 'Cancellation failed'; end if;
end;
$test$;
select 'seconds, pause/resume, completion idempotency, rewards, daily credit, bounds and cancellation passed' as verification;
rollback;

