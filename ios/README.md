# Jacked for iPhone (native SwiftUI)

Ground-up SwiftUI app on the same Supabase backend as the PWA and the watches.
Plan and screen inventory: [`../IOS_REWRITE_PLAN.md`](../IOS_REWRITE_PLAN.md).
Stage-by-stage status: [`REWRITE_STATUS.json`](REWRITE_STATUS.json), shown on JatBot OS > Status >
Jacked. Update it in the same commit whenever a stage moves.

**State (2026-11-07): see REWRITE_STATUS.json.** Home, safe saving, workout logging, Library and Routines are in; Metrics, Friends and Settings are next.
wired to the live auth contract, plus a placeholder signed-in screen that reads your own
profile row to prove the session works. No workout screens yet. No writes to any table from
the app itself (sign-up creates the account through the `jacked-auth` edge function, exactly
like the PWA).

## Run it (on the Mac)

1. `git pull` in the Jacked clone, then open `ios/Jacked.xcodeproj` in Xcode (16 or newer;
   the project uses Xcode 16's synced-folder format).
2. Pick an iPhone simulator in the toolbar, press **Cmd-R**.
3. Log in with your real Jacked username and password, or sign up a throwaway test account.
   The signed-in screen should show your display name, workout count and streak.

For a real iPhone: target > Signing & Capabilities > Team = the developer account, and change
the bundle id if Xcode says it is taken. Simulator runs need no team.

**This code has never been built in Xcode.** It was written on the Linux desktop. The
networking/auth layer (no UI) is compile-checked and smoke-tested there against the live
backend (`Tests/linux-check.sh`, 16/16 pass on 2026-11-04). The SwiftUI views, the Keychain
code and the project file itself have only been checked by reading and by a project-file
parser. Expect the first Cmd-R to possibly surface a small compile error; paste it back.

## Layout

```
Jacked.xcodeproj         Xcode 16 project, synced folder: any file added under Jacked/ is in the build
Jacked-Info.plist        merged into the generated Info.plist (fonts, export-compliance flag)
Jacked/App               @main app + root router (signed out / signed in)
Jacked/Backend           Supabase URL + publishable key, thin URLSession JSON client (no SDK)
Jacked/Auth              auth API calls, session model, Keychain, AuthStore, username rules
Jacked/Theme             PWA palette (from index.html :root) + button/field styles
Jacked/Views             AuthView (login/sign-up), SignedInView (placeholder)
Jacked/Resources/Fonts   Barlow Condensed (OFL), the PWA's heading font
Tests/                   Linux-only check of the Foundation layer (not an Xcode test target)
```

Settings worth knowing: iOS 17.0 minimum (pending Mr. Roni's answer, see plan), portrait only,
iPhone only, Swift 5 language mode, bundle id `com.inclineinstitute.jacked.ios` (placeholder,
see plan).

Body text uses the system font; the PWA uses DM Sans. Bundling DM Sans is a small follow-up.

## Building and checking from the desktop (agent jobs)

The agent repo's `scripts/jacked-ios-mac-build.sh <ios dir>` copies this tree to the Mac and runs
`xcodebuild` for the simulator; `scripts/jacked-sim-shot.sh` installs the build, signs in as the
throwaway test account (`config/jacked-ios-dev-test-account.json`, via the DEBUG-only
`App/DevHooks.swift` launch environment) and takes a screenshot. Copies of both live in `Tools/`.
`Tools/pwa-shot.mjs` screenshots the local PWA logged in as the same account, for side-by-side
checks. `Tools/pbx-add.py` registers new Swift files in the Xcode project. `Tools/seed-test-account.py`
gave the test account its fixture history once (it refuses to overwrite).
Never point any of these at a real person's account.
