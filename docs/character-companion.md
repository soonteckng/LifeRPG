# Character companion and Profile

Existing saved avatar emoji values identify ten full companion looks. Each changes the head/body palette and accessory, including a cap, headphones, beret, sprout, antenna and cat ears. Profile, Home and editor thumbnails share one scalable drawing. Legacy aliases have a fallback; no avatar migration or new profile fields are required.

Profile groups the companion, saved name, level, XP meter and Personalise action in one identity card. The single milestone entry follows it, with focus areas grouped below. The character is cosmetic and never awards XP or changes recorded growth.

The profile editor has one fixed opening size with timed motion and dynamic sizing disabled. Its preview and thumbnails have fixed geometry, so choosing a look, typing or displaying a validation error cannot resnap the sheet. Save stays outside scrolling content; the existing keyboard-safe name input and 15-character limit remain. Drafts, retry, discard confirmation and retained exit contents are preserved.

Breathing and blinking repeat on the UI thread through Reanimated shared values. A tap adds a short greeting and changes the expression once. Route blur, app background, hidden previews and Reduce Motion cancel movement. Picker thumbnails remain static and memoized while typing. Home displays the same look with quiet motion and no extra tap target.

The tour keeps its existing page overview, animation and return to Home. Wording now points to Personalise, focus areas and the single milestone collection. Native frame pacing and keyboard behavior still require phone acceptance; tests cover visual identity, motion lifecycle and profile save/draft behavior.
