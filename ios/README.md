# Jacked for iPhone (native SwiftUI)

Ground-up SwiftUI app on the same Supabase backend as the PWA and the watches.
Plan and screen inventory: [`../IOS_REWRITE_PLAN.md`](../IOS_REWRITE_PLAN.md).
Stage-by-stage status: [`REWRITE_STATUS.json`](REWRITE_STATUS.json), shown on JatBot OS > Status >
Jacked. Update it in the same commit whenever a stage moves.

**State (2026-11-04): first slice only.** Login / sign-up screen in the PWA's dark/teal style,
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
