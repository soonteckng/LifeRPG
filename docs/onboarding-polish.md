# Calm onboarding and introduction

The signed-in setup uses one seven-page journey: focus direction, its default block (or a free-focus explanation), name, daily goal, and three brief introduction pages. Back works across every page boundary and retains choices. All seven pages are required for new users. Returning users open How LifeRPG works rather than replaying setup; its quick-tour entry is available later.

One shared frame keeps progress and the Back/Continue row outside the scroll area. Back is disabled on the first page and after successful final confirmation. Ordinary content is kept short; scroll remains available for small displays, landscape, the keyboard, and larger accessibility text. Choice selection does not expand more options into the current page. Keyboard dismissal takes precedence over Android Back, then previous-step navigation; busy work prevents leaving the flow through these controls. Setup names are limited to 24 characters, and Home truncates the display of existing longer names.

Outgoing content fades before the next step replaces it. The incoming fade starts after the React commit, preventing an outgoing-page flash. Repeated transition taps are synchronously locked; unfinished animation callbacks cannot update an unmounted flow. Existing system reduced-motion settings remove step and route animations. Preferences/profile/finish are saved at the final page only. A brief checkmark/halo completion appears after confirmation succeeds. Profile refresh and Home navigation wait for the completion sequence. A refresh failure allows retry without repeating successful writes. Server errors retain the current selections and display a retryable message.

Existing authentication, onboarding RPCs, guided preference account keys, badges, XP, targets, and historical data semantics are preserved. No new dependencies or live database operations are required by this change. Personal quests remain alongside suggestions on Home.

References consulted:
- Apple onboarding: https://developer.apple.com/design/human-interface-guidelines/onboarding
- Android authentication and onboarding: https://developer.android.com/design/ui/mobile/guides/patterns/onboarding (clear progress, logical steps, skip instruction, adaptive layouts)
- Nielsen Norman Group: https://www.nngroup.com/articles/mobile-app-onboarding/ (keep upfront education brief)

Acceptance checks on a phone are still required: new-account study and free-focus paths, with every page shown; Back between pages 4 and 5; keyboard appearance, Return and Android Back; small screens and large text; rapidly repeated taps; network loss during save/finish; reduced motion; final animation and Home entry; existing-account guide and quick tour. Component tests do not prove native appearance, gesture timing, or fit. See [screenshot corrections](onboarding-layout-refinement.md) for Home fit and all six spotlight tips.

Home uses the compact daily-goal bar for every account. Preferences control study suggestions versus free focus, never the goal layout. Loading or failed preference reads show an explicit loading/retry card and do not flash the old ring or overwrite a saved choice. Existing sessions can still be continued.
