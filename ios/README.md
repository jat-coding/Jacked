# Jacked for iPhone (native SwiftUI)

Ground-up SwiftUI app on the same Supabase backend as the PWA and the watches.
Plan and screen inventory: [`../IOS_REWRITE_PLAN.md`](../IOS_REWRITE_PLAN.md).
Stage-by-stage status: [`REWRITE_STATUS.json`](REWRITE_STATUS.json), shown on JatBot OS > Status >
Jacked. Update it in the same commit whenever a stage moves.

**State (2026-11-07): see REWRITE_STATUS.json.** Home, safe saving, workout logging, Library, Routines and Metrics are in; badges, Friends and Settings are next.
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

Body text is DM Sans and headings Barlow Condensed (both bundled, OFL). Icons are the PWA's own line icons as template SVGs in Assets.xcassets (regenerate with Tools/gen-icons.py).

## Building and checking from the desktop (agent jobs)

The agent repo's `scripts/jacked-ios-mac-build.sh <ios dir>` copies this tree to the Mac and runs
`xcodebuild` for the simulator; `scripts/jacked-sim-shot.sh` installs the build, signs in as the
throwaway test account (`config/jacked-ios-dev-test-account.json`, via the DEBUG-only
`App/DevHooks.swift` launch environment) and takes a screenshot. Copies of both live in `Tools/`.
`Tools/pwa-shot.mjs` screenshots the local PWA logged in as the same account, for side-by-side
checks. `Tools/pbx-add.py` registers new Swift files in the Xcode project. `Tools/seed-test-account.py`
gave the test account its fixture history once (it refuses to overwrite).
Never point any of these at a real person's account.

## TestFlight builds from GitHub Actions

The Mac is on Xcode 15.2, which cannot build this project or produce an upload Apple accepts (App
Store uploads need the iOS 26 SDK). So TestFlight builds come from a GitHub Actions macOS runner:
`.github/workflows/ios-testflight.yml` picks the newest stable Xcode on the runner, archives the
`Jacked` scheme (app + `JackedWidgets` extension) with automatic signing, and exports with
`ios/ExportOptions.plist` (`app-store-connect`, team `CRCPKNW37U`, `destination = upload`), which
sends the build straight to App Store Connect / TestFlight. No certificates or profiles live in the
repo: Xcode creates/fetches them through the App Store Connect API key (`-allowProvisioningUpdates`).

### The three repository secrets

Set these under GitHub > the Jacked repo > Settings > Secrets and variables > Actions > New
repository secret:

| Secret | Value |
| --- | --- |
| `ASC_KEY_ID` | The API key's Key ID (10 characters, shown next to the key in App Store Connect > Users and Access > Integrations). |
| `ASC_ISSUER_ID` | The Issuer ID shown at the top of that same Integrations page (a UUID). |
| `ASC_KEY_P8` | The whole `AuthKey_<KeyID>.p8` file, base64-encoded on one line: `base64 -i AuthKey_<KeyID>.p8 \| tr -d '\n' \| pbcopy` on the Mac, then paste. |

The key needs the **App Manager** (or Admin) role, otherwise cloud signing and the upload are refused.
Never commit the `.p8`, paste it into an issue/board, or echo it in a workflow step. The workflow
writes it to the runner's temp dir with 0600 permissions and deletes it in an `if: always()` step.

### Running it

1. GitHub > Actions > **iOS TestFlight** > **Run workflow** (branch `main`). It is manual only, to
   save macOS minutes (each run is roughly 10 to 20 runner minutes, billed at the macOS rate).
2. The build number is the workflow's run number (`github.run_number`), so every run uploads a new,
   higher build. The version shown to testers is `MARKETING_VERSION` in the project (currently 0.1.0);
   bump it in the project when you want a new version line.
3. When the run is green, the build shows in App Store Connect > TestFlight after Apple's
   processing (usually 5 to 30 minutes). Add it to a tester group there.

### Before the first run

- The app record for `com.inclineinstitute.jacked.ios` must already exist in App Store Connect
  (My Apps > + > New App). The upload fails without it.
- First-run signing may stop on a capability: HealthKit and Push Notifications must be enabled on
  the App ID (automatic signing usually does this itself via the API key; if not, enable them under
  Certificates, Identifiers & Profiles > Identifiers). The widgets extension gets its own App ID
  (`com.inclineinstitute.jacked.ios.widgets`); there is no App Group today.
- Until it has actually run green once, treat this workflow as unverified.
