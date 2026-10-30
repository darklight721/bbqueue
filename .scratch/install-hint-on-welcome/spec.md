# Install hint on Welcome

Status: ready-for-agent

On iPhone and iPad, an app added to the Home Screen has its own storage, separate from the browser it was added from. An Account, its sign-in, Local clubs and Ended sessions created in the browser do not show up in the installed app (see the Account and Local club entries in `GLOSSARY.md`). On Android the installed app shares storage with the browser, so nothing is lost; installing there only gives full screen and less risk of the browser clearing the data.

Today the only install hint is on Account settings, and its copy ("keeps your Account safe") is wrong on iOS for someone who already has an Account in the browser. Decided in a grilling session.

## Changes

### 1. Who is offered the hint
`shouldOfferInstallHint` (`src/features/account/installHint.ts`) also offers it in every iOS browser, not just Safari (Chrome, Edge, Firefox, … can Add to Home Screen since iOS 16.4). It still isn't offered when running as the installed app, or on desktop. It tells iOS and Android apart, so callers can pick the copy (e.g. returns `"ios" | "android" | null`).

### 2. Welcome screen, iOS (not installed)
Installing is the main message on the Welcome screen, with the Account form below it as the less prominent way on:
- Message along the lines of: "Add BBQueue to your Home Screen first, then open it from there. What you set up here stays in this browser." Plus how: in the browser's Share menu, choose **Add to Home Screen**.
- The Account form stays usable ("Continue" / "Skip for now"), presented as a secondary option, e.g. "Continue in the browser anyway".
- Same on the offline variant of the Welcome screen ("Continue without an Account").
- Not dismissible; it goes away with the Welcome screen.

### 3. Welcome screen, Android (not installed)
Same layout as iOS (install steps on the hero, the form behind "Continue in the browser anyway" in a bottom sheet), with Android's own text: no claim that data stays behind (it doesn't on Android); reason is full screen and the browser being less likely to clear data; steps are the browser's ⋮ menu → **Install app** or **Add to Home Screen** → open BBQueue from the Home Screen. Also on the offline variant.

### 4. Account settings hint
- iOS with an Account: the hint warns that the Account won't move to the installed app ("Your Account stays in this browser. The installed app starts fresh."), and still explains how to install.
- iOS without an Account: same message as on the Welcome screen (install first).
- Android: as today.
- Keeps its own dismiss (`bq:v1:install-hint-dismissed`); finishing the Welcome screen does **not** dismiss it.

### 5. Follow-up (after review)
- **Welcome, iOS and Android:** the Account form is no longer shown under the install steps. A "Continue in the browser anyway" button opens it in the app's bottom sheet (`Modal`). The form inside works as before ("Continue", "Skip for now"). Closing the sheet goes back to the install steps. Offline: the same button leads to "Continue without an Account".
- **Account settings, Android without an Account:** shows the Android install tip too, dismissible with the same flag.

### Out of scope
- An install hint on Home for people who skipped the Welcome screen.
- Moving an Account or Local clubs from the browser to the installed app (needs email linking, ADR-0006).

## Notes
- The e2e projects use Pixel 7 and iPhone 14 user agents, not running as the installed app, so every existing spec that goes through the Welcome screen will now see the hint. Check that they still pass.
- Design (layout and how prominent each part is) by @designer; review the copy afterwards.

## E2E workflows
1. iOS browser (`webkit-mobile`): the Welcome screen shows the install-first message; "Continue in the browser anyway" still lets you create an Account, and skip.
2. Android (`chromium-mobile`): the Welcome screen shows the Android install steps (no "stays in this browser" claim); "Continue in the browser anyway" opens the form in the bottom sheet, which works.
3. Desktop user agent, and running as the installed app (`display-mode: standalone`): no hint on the Welcome screen.
4. iOS with an Account: Account settings shows the "your Account stays in this browser" warning; dismissing it is remembered across a reload.
5. iOS: "Continue in the browser anyway" opens the name form in a bottom sheet; creating an Account, skipping, and closing the sheet (back to the install steps) all work; the name field is usable with the keyboard on WebKit.
6. Android without an Account: Account settings shows the install tip; dismissing is remembered across a reload.
