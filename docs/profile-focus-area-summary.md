# Profile focus area summary

Profile follows the shared direction presentation order: Learning, Work &
projects, Creativity, Everyday life, Wellbeing, then Everyday focus. Everyday
focus is the neutral default for the chooser's Free focus option. Custom areas
remain after the six defaults. The chooser takes its direction order from the
same list and resolves colors by area name rather than list position.

The Profile previously rendered each saved subject row independently. Legacy
Fitness & Health and Grooming & Vitality rows both have the Wellbeing display
name, so the heading could appear twice. Profile now groups recognized aliases
in its display and combines their cumulative earned XP. Subject progression
uses 50 * level XP per level, with cumulative XP before a level equal to
25 * level * (level - 1). The combined display converts that total back to its
level and within-level balance. It does not add existing level numbers or drop
the XP held by a hidden duplicate. Repeated copies of the same real ID count
once. Separate custom IDs remain separate even if their names match.

This is a read-only presentation change. Real subject IDs, within-level XP,
fractional-second banks, quest/session references and database rows are not
written, renamed or deleted. The existing catalogue-loading and repair paths
stay intact. Quests and timers continue to use their real saved area ID.

## Phone check

Load the preview update, open Profile and check the direction order above.
There should be one Wellbeing row. Complete a session in a Wellbeing area and
reopen Profile: the combined meter should refresh. Switching to another
existing account should show only that account's area progress. No signup or
test email is needed.

Automated checks cover the actual Profile rows/meter, alias consolidation,
canonical ID retention, cumulative XP level boundaries, repeated-ID protection,
custom area identities, shared chooser order and unchanged source rows.

## Next part of the agreed plan

The next unfinished reliability slice is fully offline Start and local
Pause/Resume, with durable session records and an idempotent import/finalization
path. Current recovery covers sessions started online, then connection loss.
Offline Start and offline Pause/Resume are not implemented by this profile fix.

Acceptance: start with no network, use controls, close/reopen the app, finish,
reconnect, and observe exactly one saved session and one reward. First prepare
the additive backend proposal, rollback and isolated SQL tests; applying new
live SQL requires the user's approval of that concrete proposal.

The subsequent visible product milestone is remembered routines and a Home-screen
widget built on Quick Start, then optional distraction protection. Reboot and
exact-zero End device checks, plus daily-goal-only and combined daily achievement
device checks, remain pending until the user performs them. The improved native
finish notification wording is approved for batching with the next necessary
Android build.
