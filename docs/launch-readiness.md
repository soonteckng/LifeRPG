# Launch readiness (Round 82, 29 Oct 2026)

What is left before LifeRPG can go to real users on Google Play. Written by
Claude from the code, the app config and the live database. **Must** items
block a public release; **Should** items are strongly advised.

## What the app already covers

- Full session flow online and offline, protection with one break, widgets for
  routines, recovery after crashes or restarts, one sync summary for offline
  sessions.
- Character, levels, categories, Progress, Squads with player cards.
- Rewards:
  - Stardust;
  - today's trail (4 finds a day, end bonus);
  - Outfits and the trader;
  - milestones (pets, frames, badges);
  - chosen rewards (Round 82, after its SQL);
  - camp decorations;
  - rest days (after its SQL).
- Account deletion in Settings (`DeleteAccount`), sign out, password recovery.
- Developer account tools for every reward screen without waiting.

## Must, before a public release

1. **Run the Round 82 SQL** after publishing:
   - `round-82-chosen-rewards.sql`
   - `round-82-rest-days.sql`
2. **Privacy policy.** Play requires a public privacy policy URL in the listing
   and the Data safety form. The app has no privacy policy, terms or contact
   link anywhere today. Add a short page (hosted anywhere) and a Settings row
   linking to it. It should describe what is stored:
   - email and username;
   - focus sessions, goals and progress;
   - squads and their members' visible stats;
   - the installed-app list used only on the phone for protection (never
     uploaded, if that is still true; confirm in the native module before
     writing it).
3. **Account deletion web link.** Play also requires a way to request deletion
   *outside* the app (a web page or form). In-app deletion exists; the web
   route does not.
4. **Sensitive permission declarations in Play Console.** Each needs a written
   justification and may need a review video:
   - `PACKAGE_USAGE_STATS` (Usage Access, to know which app is in front during
     a protected session);
   - `SYSTEM_ALERT_WINDOW` (the protection cover);
   - `FOREGROUND_SERVICE_SPECIAL_USE` (the protected session and countdown);
   - `SCHEDULE_EXACT_ALARM`. Play limits exact alarms to alarm and calendar
     apps; if the reminders don't truly need exact timing, switch to inexact
     alarms in the native round, or Play may reject the build.
5. **Email delivery.** Supabase warned about bounced emails. Before real sign-ups,
   set up a custom SMTP sender (or another provider) for confirmation and
   password emails, and turn on CAPTCHA (already on the native list).
6. **Final name, icon and listing.** The handoff still says the name is not
   final. Needed:
   - Play listing: icon, feature graphic, phone screenshots, short and full
     description;
   - content rating questionnaire;
   - target audience. The product is for 16 to 24. Declaring under-18 users
     brings extra Families-policy rules, so choose the age range deliberately.
7. **The November native build** (see `HANDOFF.md` section 10):
   - one combined session notification;
   - notification icon, swipe-away behaviour, 1 s countdown offset;
   - keep-awake, lock-screen focus view;
   - study widget, Google sign-in sheet, CAPTCHA;
   - calendar sync (listed as top priority).
8. **A real-phone test pass on the final build**:
   - a small 360 × 640 phone and a large one;
   - font size at its largest;
   - Android 10 to 15 if possible;
   - offline for a whole day then reconnecting;
   - a session left running for hours;
   - account switching;
   - every Developer preview.

## Should

- **Supabase advisors:** review the findings in `HANDOFF.md` section 7.2 (RLS and
  function search paths) and fix what applies.
- **Crash reporting:** add it (for example Sentry) in the native build, so
  problems on users' phones are visible without the session log.
- **Store reviewers:** a short "What's new" text and a demo account. Reviewers
  will need to sign in; never use the developer or Soon Teck accounts for this.
- **Frame pacing:** check the Home map sheet and the squad card on the slowest
  phone available. Both were reported as slightly laggy.
- **Wording:** a final read of every screen in one sitting, for warm,
  consistent wording, no em dashes and no leftover developer phrases.

## Fixed in this sweep

- Em dashes in two visible strings (a guided-routine hint, Profile's loading
  placeholder).
- The in-app guide now explains:
  - today's trail and Stardust;
  - choosing a reward;
  - the camp;
  - rest days.
- Item hints and Outfits no longer promise "daily supply packs", which end when
  chosen rewards start. They now say "a daily goal reward", which is true
  before and after.
