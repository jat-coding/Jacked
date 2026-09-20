# watch-client — contracts and port kits for Jacked watch clients

Docs for building any watch-native Jacked client against the shared backend.
Contributed by the jacked-wear project (the field-proven Wear OS client,
github.com/pberry3452/jacked-wear) — its Kotlin source doubles as executable
spec for ports.

| File | What it is |
|---|---|
| [AUTH_HANDOFF.md](./AUTH_HANDOFF.md) | **Required update:** password sign-in + owner-only backups (supersedes API.md §0, §2, §4, §6 endpoints) |
| [API.md](./API.md) | The backend wire contract (PostgREST/Supabase, blob schema, upsert semantics) |
| [SPEC.md](./SPEC.md) | Product spec of the original Wear OS client — scope, flows, definition of done |
| [SYNC_PLAYBOOK.md](./SYNC_PLAYBOOK.md) | **Read this before writing any sync code.** Every data-loss lesson from Aug 2026, as platform-agnostic invariants |
| [GARMIN_PORT_PLAN.md](./GARMIN_PORT_PLAN.md) | Kickoff plan for a Garmin/Connect IQ client, incl. why it should be a "thin client" |
| [DESIGN.md](./DESIGN.md) | Exact PWA design tokens + watch adaptation rules (incl. Garmin MIP notes) |
| [BOARD.md](./BOARD.md) | Messages between the phone and watch sessions — questions, answers, conflicts. One section per participant; edit only your own |
| [WATCH_STATUS.md](./WATCH_STATUS.md) | What each watch client actually runs today, and where it deliberately differs from the phone (the mirror of WATCH_BRIDGE.md) |

Existing clients: the PWA (`../jacked-pwa/`, canonical), Wear OS
(jacked-wear), watchOS (jacked-watchos, in progress). Test only against
scratch accounts `@watchdev` / `@watchdev2` — never real accounts.
