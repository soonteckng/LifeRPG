# Onboarding and Home layout correction

This pass addresses the phone screenshots from the free-focus and guided account walkthroughs.

- All seven pages now use one `OnboardingJourney`. Back crosses the former page 4/5 route boundary and retains the name, goal and suggestion choices. The existing profile/finish RPCs run at the final step only. Failed writes retain drafts; retrying a confirmed setup refresh does not repeat successful writes. Existing introduction links remain compatible; returning users still open the static guide.
- Back and Continue share one fixed footer row. Names are limited to 24 characters during setup; existing longer names retain their stored value and Home truncates their display.
- Page fades begin only after the incoming React content commits, with the outgoing content held until fade-out finishes. Keyboard/scroll resets occur before the new page becomes visible.
- Home's goal value and edit icon share one trailing group. Focus/anchor wrappers have explicit full widths. The free-focus instruction and quest rows are compact enough for two ordinary rows on typical phone sizes. A short layout distributes spare space between sections, with a single exact reservation for the floating dock. Long text, large accessibility sizes, small screens and active-session banners still permit scrolling.
- The tour has six concise tips, including a dedicated Find your next step highlight in both modes. Targets are small, stable components: identity, Start/Continue, suggestion access, quests, Progress controls and the Life-area heading.
- Targets and the native Modal overlay are both measured in window coordinates; their origins are subtracted rather than assuming a status-bar offset. The tour waits for stable target measurements, measures the actual panel/text height, and chooses above/below placement with safe-area bounds. Large body text can scroll within the tip.
- The old target and message fade out before switching. Highlight brightness, outline and incoming tip fade together. Late target measurements cannot interrupt an outgoing transition. No temporary loading message changes the panel size between steps.

Regression coverage includes backward navigation through all seven pages, retained choices, the name limit, final-step-only/duplicate-safe saves, completion refresh retries, Android overlay-coordinate conversion, non-overlapping popup placement, all six tour tips, per-account receipts, and late measurements during fade-out.

Physical-device acceptance remains necessary: repeat the supplied screenshot cases with zero/one/two quests, guided/free mode, a long name, normal/large text, device Back, keyboard use, reduced motion and all tour tips. Check that the last quest clears the dock and fitting content does not require a small extra scroll. Native frame rate and actual phone layout are not established by mocked component tests.

This pass changes no database schema or native dependencies. The previously prepared daily-goal migration remains unapplied pending separate approval.
