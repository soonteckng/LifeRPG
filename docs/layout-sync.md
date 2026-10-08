# Home, tour and Profile corrections

Character look tiles put the percentage width on a real layout cell outside the native touchable wrapper. Each label can wrap without ellipsis. The name editor, keyboard handling, save footer and ten saved look identifiers are preserved.

Tour step 2 uses a concise message and a compact focus-card preview only while that card is targeted. The full measured card remains the highlight; its full description returns when the tour moves on. Dialog body space accounts for the card and dock, with extra outline clearance. Smaller screens and larger text use a shorter prompt preview. Existing Back/Next transitions, content fades, navigation dock and return to Home are preserved. Home's character thumbnail now opens Profile.

Focus area and Find your next step share an account-scoped saved area/direction preference. Selecting a curated category updates the prompt and direction together. Free focus remains free while remembering the corresponding direction for later. Everyday focus or a custom category uses free focus. Explicit direction or prompt changes clear a stale area override and derive its matching category. Missing category IDs fall back to the current catalogue. Chosen exact durations, including a remembered previous duration, survive mode switches. Failed saves retain the old selection and show an error, without starting a session.

Progress session drilldowns show only the selected week or month, or its selected day/area subset. The unbounded all-history mode and loading actions are removed from the UI. The existing completed-session query still applies date bounds and pagination, and analytics exclude comparison-period rows. No historical sessions are deleted.

Application-owned em dashes are replaced with sentence punctuation; words and features are retained. Existing session snapshots and user-written text are preserved.

Phone acceptance: verify all look labels, guide step 2 at normal and larger text sizes, both direction/category controls, exact custom and remembered durations, the Home Profile shortcut, and week/month session lists. Browser previews and regression tests do not prove native frame pacing.
