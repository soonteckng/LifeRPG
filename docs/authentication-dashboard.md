# Authentication dashboard checklist (not executed)

No dashboard settings or remote account data were changed or inspected during this task.

1. Review Authentication -> Providers -> Email confirmation settings. Require email confirmation for the intended signup policy. The installed Supabase SDK documents that both Confirm email and Confirm phone affect obfuscated duplicate-signup responses, even if phone sign-in is disabled. Preserve account-enumeration protection; do not disable confirmation to make an inaccessible email usable. The client also neutralises recognised duplicate-signup errors.
2. Configure a controlled sender/SMTP and use an accessible test inbox. Check sender/domain verification, mailbox restrictions, email rate limits and spam filtering. Signup and recovery acknowledgements do not prove delivery.
3. Follow [password-recovery.md](password-recovery.md) for exact native/web/development redirect URLs and Reset Password template requirements. Signup confirmation currently uses the configured Site URL; after confirming the email, return to the app and sign in. Do not redirect signup confirmations to the password-recovery callback.
4. In a user-run test, distinguish `data.user` with no session from an actual server-verified session. Retain only safe diagnostic facts such as event name and whether a session exists. Do not record access/refresh tokens, confirmation URLs, passwords, or recovery credentials.
5. Verify ownership RLS for profiles, tasks, subjects, activity_sessions and daily_progress. Review signup profile creation and complete_onboarding/finish_onboarding RPCs: require auth.uid(), write only the caller's profile, never match an existing profile by email, and do not reset XP/gold/history for existing users. The client changes do not audit or repair unseen remote policies/triggers.
6. Never delete/recreate the inaccessible old test account. No email reset can recover a mailbox that the user does not control. The user later explicitly authorized an email-only administrator recovery for this account; that operation is documented separately in [administrator-recovery.md](administrator-recovery.md). It does not authorize other account changes or dashboard policy changes.

Read-only policy metadata inspection, if separately performed by the project owner:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','tasks','subjects','activity_sessions','daily_progress')
order by tablename, policyname;
```

This query does not inspect account/password records. It was not run here. Review server-side function definitions in a trusted environment and do not paste secrets or account data into logs.

References: [Supabase signup](https://supabase.com/docs/reference/javascript/auth-signup), [password auth](https://supabase.com/docs/guides/auth/passwords), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
