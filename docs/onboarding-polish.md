# Calm onboarding and introduction

The signed-in setup now uses four short steps: focus direction, its default block (or a free-focus explanation), name, and daily goal. The three-page introduction continues the same seven-step progress indicator. Replaying the introduction uses its own three-step indicator and never writes onboarding or progression again. All seven pages are required for new users; neither setup nor introduction offers a skip action.

One shared frame keeps progress and primary/secondary controls outside the scroll area. Ordinary content is kept short; scroll remains available for small displays, landscape, the keyboard, and larger accessibility text. Choice selection no longer expands more options into the current page. The footer reserves its secondary-action row even when a link is absent. Hidden links are not exposed to screen readers. Keyboard dismissal takes precedence over Android Back, then previous-step navigation; busy work prevents leaving the flow through these controls.

Outgoing content fades before the next step replaces it. Repeated transition taps are synchronously locked; unfinished animation callbacks cannot update an unmounted flow. Existing system reduced-motion settings remove step and route animations. A brief checkmark/halo completion appears only after the finish RPC succeeds. Profile refresh and Home navigation wait for the completion sequence. A refresh failure allows retry without repeating the successful finish RPC. Server errors retain the current selections and display a retryable message.

Existing authentication, onboarding RPCs, guided preference account keys, badges, XP, targets, and historical data semantics are preserved. No new dependencies or live database operations are required by this change. Personal quests remain alongside suggestions on Home.

References consulted:
- Apple onboarding: https://developer.apple.com/design/human-interface-guidelines/onboarding
- Android authentication and onboarding: https://developer.android.com/design/ui/mobile/guides/patterns/onboarding (clear progress, logical steps, skip instruction, adaptive layouts)
- Nielsen Norman Group: https://www.nngroup.com/articles/mobile-app-onboarding/ (keep upfront education brief)

Acceptance checks on a phone are still required: new-account study and free-focus paths, with every page shown; keyboard appearance, Return and Android Back; small screens and large text; rapidly repeated taps; network loss during save/finish; reduced motion; final animation and Home entry; existing-account tutorial replay. Component tests do not prove native appearance, gesture timing, or fit.

Home uses the compact daily-goal bar for every account. Preferences control study suggestions versus free focus, never the goal layout. Loading or failed preference reads show an explicit loading/retry card and do not flash the old ring or overwrite a saved choice. Existing sessions can still be continued.
