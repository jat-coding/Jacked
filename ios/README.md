# Jacked for iPhone (native SwiftUI)

Ground-up SwiftUI app on the same Supabase backend as the PWA and the watches.
Plan and screen inventory: [`../IOS_REWRITE_PLAN.md`](../IOS_REWRITE_PLAN.md).

**State (2026-11-04): first slice only.** Login / sign-up screen in the PWA's dark/teal style,
wired to the live auth contract, plus a placeholder signed-in screen that reads your own
profile row to prove the session works. No workout screens yet. No writes to any table from
the app itself (sign-up creates the account through the `jacked-auth` edge function, exactly
like the PWA).

## Before the first build: add the Supabase package (once, in Xcode)

The app talks to the backend through [`supabase-swift`](https://github.com/supabase/supabase-swift)
(decided 2026-11-04). The package is **not** wired into `Jacked.xcodeproj` yet: adding it by
hand-editing `project.pbxproj` is an easy way to corrupt the project, so it is done once in
Xcode's own UI. Until it is, the build fails with `No such module 'Supabase'`.

1. Open `ios/Jacked.xcodeproj`.
2. **File > Add Package Dependencies...**
3. Paste `https://github.com/supabase/supabase-swift` into the search field, keep
   *Up to Next Major Version* (2.x), click **Add Package**.
4. In the product list tick only **Supabase**, with *Add to Target* = **Jacked**, click
   **Add Package**.
5. Commit the resulting `project.pbxproj` and `Package.resolved` changes so nobody has to
   do this again.

## Run it (on the Mac)

1. `git pull` in the Jacked clone, then open `ios/Jacked.xcodeproj` in Xcode (16 or newer;
   the project uses Xcode 16's synced-folder format).
2. Do the package step above if `Supabase` is not listed under *Package Dependencies* in the
   project navigator yet.
3. Pick an iPhone simulator in the toolbar, press **Cmd-R**.
4. Log in with your real Jacked username and password, or sign up a throwaway test account.
   The signed-in screen should show your display name, workout count and streak.

For a real iPhone: target > Signing & Capabilities > Team = the developer account, and change
the bundle id if Xcode says it is taken. Simulator runs need no team.

**This code has never been built in Xcode.** It was written on the Linux desktop. The
networking/auth layer (no UI) is compile-checked there against `supabase-swift` 2.55.6 and
smoke-tested against the live backend (`Tests/linux-check.sh`, 21/21 pass on 2026-11-04;
`AuthStore` also typechecks there with a Combine stand-in). The SwiftUI views, the Keychain
code and the project file itself have only been checked by reading and by a project-file
parser. Expect the first Cmd-R to possibly surface a small compile error; paste it back.

## Layout

```
Jacked.xcodeproj         Xcode 16 project, synced folder: any file added under Jacked/ is in the build
Jacked-Info.plist        merged into the generated Info.plist (fonts, export-compliance flag)
Jacked/App               @main app + root router (signed out / signed in)
Jacked/Backend           Supabase URL + publishable key, the one SupabaseClient, error mapping
Jacked/Auth              auth API calls (SDK), session model, Keychain session store, AuthStore, username rules
Jacked/Theme             PWA palette (from index.html :root) + button/field styles
Jacked/Views             AuthView (login/sign-up), SignedInView (placeholder)
Jacked/Resources/Fonts   Barlow Condensed (OFL), the PWA's heading font
Tests/                   Linux-only check of the Backend/Auth layer, builds supabase-swift (not an Xcode test target)
```

Settings worth knowing: iOS 17.0 minimum (pending Mr. Roni's answer, see plan), portrait only,
iPhone only, Swift 5 language mode, bundle id `com.inclineinstitute.jacked.ios` (placeholder,
see plan).

Body text uses the system font; the PWA uses DM Sans. Bundling DM Sans is a small follow-up.

## Session storage

`supabase-swift` owns the session: it saves it, refreshes it before it expires while the app
is open, and saves each rotated refresh token before using it. *Where* it saves it is ours:
`Auth/KeychainStore.swift` plugs into the SDK's `AuthLocalStorage` and stores items as
`AfterFirstUnlockThisDeviceOnly`. The SDK's built-in Keychain storage uses `AfterFirstUnlock`,
which lets a live refresh token travel to another phone inside an encrypted backup; this keeps
the stricter setting the first scaffold had. The Jacked username sits next to the session in
the same store (Supabase's session doesn't carry it).

Sign-up still goes through the `jacked-auth` edge function (now via `functions.invoke`), not
`auth.signUp`: the function creates the auth user and the `profiles` row together, with the
synthetic sign-in email the PWA and watches rely on.
