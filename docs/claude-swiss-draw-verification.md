# Claude Code Verification Prompt

Copy the prompt below into the existing Claude Code session.

```text
Independently audit and verify the new Swiss team-by-team draw in D:\Projects\Lauchgruen\Web. Codex integrated the previously local fake-team simulator into the real owner-only tournament admin workflow. Do not assume that the implementation or its tests are correct. Fix concrete defects with regression tests, then report evidence and any remaining limitations. No software can be guaranteed 100%; do not claim that without qualification.

Safety and workspace:
- Read AGENTS.md and inspect git status/diff first. These changes are currently local, not deployed. Do not commit, push, deploy, change tournament settings, or alter actual tournament records without a separate instruction.
- Preserve unrelated work, especially the pre-existing dirty tsconfig.json.
- .env.local points at a REAL remote MongoDB. Never use it for test writes, resets, repairs or cleanup. Do not print secrets.
- Docker container lauchgruen-local-mongo provides Mongo at 127.0.0.1:27027. Use only unique disposable local databases for integration tests. Never drop an existing database or reset the user's default simulator session.
- Keep /swiss-draw-test and /api/tournament/swiss-pot-test local/development-only and isolated from production collections. No production login bypass or test authorization shortcuts.
- Do not stop the user's existing dev server. Browser access was previously blocked by saved permissions. Use authorized access if available; do not bypass a denial. Explicitly report any visual/E2E checks that cannot run.

Trace the REAL path, not only the simulator:
- src/app/tournament/admin/live/page.tsx
- src/app/tournament/admin/live/SwissDrawControl.tsx
- src/app/tournament/admin/live/LiveSwissPotControl.tsx
- src/app/api/tournament/swiss/route.ts
- src/lib/tournament-swiss.ts
- src/lib/swiss-live-pot.ts
- src/lib/swiss-pot-draw.ts
- src/components/SwissTeamDrawReel.tsx
- src/lib/swiss-draw-reel.ts and src/app/draw-reel.css
- Existing match-control, match-result, stage/standings and playoff seeding consumers.

Required behavior:
1. For eight-team, four-round placement Swiss with eight advancing teams, each draw randomly selects exactly ONE remaining team on the SERVER. It does not secretly select a complete future matching. It uses stable published team keys and full team names, not tags as identity.
2. Eight-team pot slots pair A-E, B-F, C-G, D-H. Four-team pots pair A-C, B-D. Two-team pots pair automatically. A configured seeded first round must still honor the published seeding and must not pretend to be a random draw.
3. Round 1: four 0-0 matches. Round 2: two matches at 1-0 and two at 0-1. Round 3: one 2-0, two 1-1 and one 0-2 match. Round 4: only the 2-1 and 1-2 placement deciders from the middle round-three teams. Top and bottom pairs must not play again in round four.
4. Never cross records in this format. Rounds 1-3 must never repeat opponents. If a drawn opponent cannot fill the current slot, put that SAME team into the next valid FREE opponent-half slot, keeping earlier empty slots available and preserving all previous draws. Check whether the remaining undrawn teams can still fill the slots; do not silently reroll or move already placed teams. Explain any shift in the log.
5. A no-rematch fourth placement round is mathematically impossible for some otherwise valid histories. Stop with an explicit warning and require deliberate admin confirmation for those same-record deciders. Never quietly enable cross-record pairings or change the tournament format. Approval must be tied to the displayed state version so a stale dialog cannot approve a different draw.
6. Only the active SLOT animates. Exactly one name is visible at a time, cycling only teams still eligible in that record pot. Other slots stay still. The result is server-authoritative, slows down to exactly that name, holds it visibly for 750ms, then commits the saved board. No previous name should appear to be the winner before a different name is inserted. Check single-team pools, reduced motion, slow responses, errors, unmount and retry.
7. Draws survive reload/server restart. Refreshing during the animation must show the already saved team, not draw again. Double-clicks, two admins, two tabs and delayed polling must not consume extra teams or overwrite newer draws. Test existing-round CAS races as well as initial document insertion.
8. Completed pots create standard scheduled match IDs and resolve into existing match control. Results, readiness, draft access, Discord announcements, replay handling and playoff seed derivation must retain their normal workflow. A draw must not automatically start a draft or send match-ready messages. Test actual consumer integration, not just string-shaped IDs.
9. Verify the stage-update/match-outbox failure path: interrupted writes are recoverable, existing match status/results are never overwritten, and reset/redraw cannot leave stale or incorrectly reused match documents. Exercise draw-versus-result, draw-versus-reset/redraw, and polling/outbox recovery races. If a multi-document operation needs stronger protection, implement it safely without assuming that local standalone Mongo supports transactions.
10. Preserve existing completed rounds and results. A partially revealed legacy round must finish through its compatible old flow before switching to team slots. No existing live data should be migrated or reset automatically. Other team counts, Swiss elimination, play-ins and non-placement Swiss must retain compatible behavior. Never mutate production data to test compatibility.
11. Owner authorization must protect every mutation and owner-only simulation/audit reads. Reject forged/stale versions, invalid actions, unrelated winners and membership changes. Test mode must not create live matches or write the main tournament audit.
12. Verify full final seeds #1-#8 from real match results, including explicit placement-rematch approval. Confirm that the existing playoff builder receives the same seeds and that the configured double-elimination format still resolves correctly.
13. Check long team names, narrow screens, keyboard operation, disabled draw buttons, accessible announcements, confirmation focus and readable error/recovery states. Use the real authenticated admin route against an isolated LOCAL test database for E2E if authorized; fake-page screenshots alone are insufficient.

Verification commands (PowerShell, from D:\Projects\Lauchgruen\Web):
pnpm typecheck
pnpm test

Focused tests:
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --import ./tests/setup/alias.mjs --test tests/swiss-live-pot-route.test.mjs tests/swiss-live-pot-ui.test.mjs tests/swiss-pot-draw.test.mjs tests/swiss-pot-ui.test.mjs tests/swiss-draw-reel.test.mjs tests/tournament-swiss-eight-team-audit.test.mjs

Real-service local Mongo tests:
$env:SWISS_DB_TEST_URI="mongodb://127.0.0.1:27027/?directConnection=true"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --import ./tests/setup/alias.mjs --test tests/swiss-live-pot-db.test.mjs tests/tournament-swiss-stage-db.test.mjs
Remove-Item Env:SWISS_DB_TEST_URI

Local sandbox persistence test:
$env:LOCAL_SWISS_DB_TEST="1"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --import ./tests/setup/alias.mjs --test tests/swiss-pot-sandbox.test.mjs
Remove-Item Env:LOCAL_SWISS_DB_TEST

Run ESLint and formatting checks on all changed implementation/test files. Check a production build if feasible without corrupting the user's running dev server artifacts; otherwise explicitly state that it was not run.

Known baseline: before the live integration, the full suite already failed tests/tournament-match-ready.test.mjs because it expects {ok:true} but the Discord helper returns {ok:true,messageId:undefined}. Reproduce and classify that separately; do not weaken tests just to claim green. The exhaustive Swiss audit covers 79,872 legal three-round histories up to first-round relabeling and demonstrates why round-four rematch approval can be necessary.

Deliver:
- Findings first, ordered by severity, with file/line references.
- Fixes made and regression tests added.
- Exact checks executed and pass/fail/skip results.
- Any untested browser, build, concurrency or production assumptions.
- A clear recommendation: ready for deployment, or specific blockers. Do not claim the live site has changed unless it was actually deployed under a separate authorization.
```
