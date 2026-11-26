# Win Challenge: build plan

A race between duo teams. Anyone can sign up on a public page and is in right away. Players form a team of two with a join code. Each team works through a fixed list of games in any order. The team that **finishes every game first** wins. The clock runs for everyone from the official start time. There is no auto-tracking: the teams press the buttons themselves (it is among friends, we trust each other). One team member must be live on Twitch to resume the timer or to count progress.

Every participant enters with one Twitch sub as stake. When the challenge is over, the site tells every participant whom to gift their sub to. The top 3 teams receive the subs.

Status: planned, not built.

---

## 1. Decisions (agreed)

| Topic | Decision |
|---|---|
| Entry | Public sign-up page, solo. Everyone is accepted instantly |
| Requirements | Discord login and a linked Twitch account |
| Teams | 2 people. A player creates a team (gets a join code) or joins one with a code |
| Late entries | Sign-up and team forming stay open after the start (each team has its own timer) |
| Game list | Fixed list, announced in advance, same for every team |
| Order | Free. Teams pick which game to play next |
| Start | Start button stays locked until the challenge start time (server-checked) |
| Stream rule | Start, resume and every progress button need at least one team member live on Twitch |
| Pause | Status only (shows "PAUSE" on stream and leaderboard). The clock keeps running, so pausing cannot be used to gain time (changed 2026-11-26) |
| Reset | No timer reset for teams. Admins can correct a time |
| Checking | No auto-check of games. Buttons only. No proof, no mod review |
| Ranking | First to finish wins. Then by games done, then by who reached that count first |
| End date | None. Lauchgruen ends the challenge in admin when it is decided (see section 9) |
| Stake | Each participant gifts 1 Twitch sub. Places 1–3 receive them |
| Rules page | Not needed. Short rules box on the sign-up page instead |

### Still open (defaults used if nobody decides)

1. **Who may press buttons:** default = both team members.
2. **Discord messages** for "game done" and "team finished": default = off. Easy to add later.
3. **Give up button:** default = yes, marks the team "aufgegeben" and stops the timer. Admin can undo. A team that gives up still owes its subs.
4. **Going offline while the timer runs:** default = the timer keeps running (their loss). Option: auto-pause when no member was live for 10 minutes.
5. **Sub split** between places: default = 50 % / 30 % / 20 % of all subs (see section 9).
6. **Which channel the sub is gifted on:** the recipient picks "my channel" (default) or "my partner's channel" on the sign-up page; fallback Lauchgruen's channel only without a linked Twitch login. See section 9.
7. **Do winners also pay their own stake:** default = yes, everyone pays one sub. Nobody is ever assigned to gift to their own team.

---

## 2. Concepts

**Challenge**: name, slug, start time, list of games, status (`draft`, `open`, `ended`, `archived`), sign-up open yes/no, sub split.

**Game** (one entry of the list):
- `title` (e.g. "League of Legends Duo Queue")
- `goal` text (e.g. "3 Siege in Folge")
- `type`:
  - `check`: one "Erledigt" button
  - `counter`: needs `target` (e.g. 3). Buttons `+`, `−`, `Reset`. Done when the count reaches the target
- optional icon or image

**Participant**: Discord ID and name, Twitch login and ID, signed up at, team (optional), sub target (self or partner) for receiving subs.

**Team**: name, two members, join code, status (`forming`, `ready`, `running`, `paused`, `finished`, `gave-up`).
- `forming`: one member, waiting for a partner
- `ready`: two members, timer not started

**Team progress per game**:
- `check`: done yes/no, done at
- `counter`: current count, number of tries (each `Reset` adds a failed try), done at
- "currently playing" marker (one game per team at a time, optional)

**Timer** (server is the only clock, same principle as the champ select clock fix):
- Stored as segments: `startedAt` / `pausedAt` pairs.
- Running time = sum of all closed segments + (now − current start) if running.
- The overlay gets `elapsedMs` and `runningSince` from the server and counts locally, corrected with the server time offset (`src/lib/clock-sync.ts`).
- When the last game turns done, the timer stops automatically and the final time is frozen.
- Undoing a game after finishing reopens the team and the timer continues from where it stopped (paused state, a member resumes).

---

## 3. Sign-up and teams

**Sign-up page** (`/winchallenge/mitmachen`):
1. Discord login (existing Auth.js login).
2. Twitch link. Reuse the existing Twitch linking of the tournament site (`tournament_twitch_links`). Without a linked Twitch account the sign-up button stays disabled with a short reason.
3. Short rules box:
   - one member must stream while the timer runs and when progress is marked
   - stake: 1 gifted Twitch sub per person, paid after the end
   - fair play among friends, the orga can remove teams
4. Checkbox "Ich habe die Regeln gelesen und zahle meinen Einsatz (1 Sub)" and the button **Mitmachen**. The participant is in right away.

**Forming a team** (same page, after sign-up):
- **Team erstellen**: enter a team name (checked with `src/lib/team-name-filter.ts`, same blocklist as the tournament). The page shows a join code like `LAUCH-7K3Q` with a copy button. Status `forming`.
- **Team beitreten**: enter a code. The team becomes `ready` with two members.
- **Team verlassen**: only before the team's timer started. If the creator leaves, the partner keeps the team. A new code can be generated (the old one stops working).
- Codes: 4–6 characters, no look-alikes (no 0/O, 1/I), unique, case-insensitive. Join attempts are rate limited per user.
- A player can be in one team at a time.
- After a team has started, its members are fixed. Changes only through admin.

**Admin** can still create teams, move players, remove players or teams, and close sign-up.

---

## 4. Stream rule

One of the two members must be live on Twitch to:
- press **Start** or **Weiter** (resume)
- press **Erledigt**, `+` or **Reset**

Not needed for: **Pause**, **Rückgängig**, `−`. Those only correct or stop, so they must always work.

How:
- The server checks the live status of both members with the Twitch API (existing helper `src/lib/twitch.ts`, app access token), cached for 60 seconds.
- If nobody is live, the button is disabled with the hint "Einer von euch muss live sein."
- If the Twitch API is down, the server allows the action and writes a note into the event log (no lock-out because of a Twitch outage).
- The live member's channel is shown in the overlay and on the leaderboard.

Open decision 4 (auto-pause when offline) would use the same check every minute.

---

## 5. Pages and URLs

All on the main site `lauchgruen.de` (apex host). `proxy.ts` needs new pass-through rules.

| URL | Who | Purpose |
|---|---|---|
| `/winchallenge` | public | Leaderboard, game list, link to sign-up |
| `/winchallenge/mitmachen` | logged in | Sign-up, Twitch check, create or join a team |
| `/winchallenge/team/[slug]` | public | One team: progress per game, time, members, stream links |
| `/winchallenge/control` | team members | Control panel for the own team |
| `/winchallenge/einsatz` | logged in | After the end: whom to gift your sub to, and incoming subs |
| `/winchallenge/admin` | owners (`TOURNAMENT_OWNER_DISCORD_IDS`) | Setup, teams, corrections, end and payout |
| `/obs/winchallenge/[slug]/main` | OBS | Main tracker overlay |
| `/obs/winchallenge/[slug]/bar` | OBS | Compact bar overlay |
| `/obs/winchallenge/leaderboard` | OBS | Leaderboard overlay for Lauchgruen's stream |

`/obs/*` and `/api/obs/*` are already outside the proxy matcher, so overlays work on any host.

**About overlay links:** overlays are read-only. They only show a team's progress, the slug is just the team name. If someone else adds that link to their OBS, they show that team's real progress, which does no harm. So no secret tokens. Only the control panel and sign-up need a login.

---

## 6. Control panel (`/winchallenge/control`)

Built for phones too, big buttons.

- Header: team name, partner, timer (large), state, live status of both members.
- Before the start time: start button disabled with a countdown ("Start möglich in 2 h 14 min").
- Team still `forming`: show the join code and "Warte auf deinen Partner".
- After the start time: **Start**, then **Pause** / **Weiter**. No reset.
- Game list, one row each:
  - `check`: **Erledigt** / **Rückgängig**
  - `counter`: `−` `2/3` `+` and **Reset** (asks once: "Versuch zurücksetzen?"). Shows "Versuch 5".
  - **Spiele ich gerade** marks the current game (shown big in the overlay).
- Buttons that need a stream are disabled while nobody is live (section 4).
- **Overlay-Links kopieren**: copy buttons for main and bar overlay, with a small preview.
- **Aufgeben** with a confirm dialog.
- Every action writes an event (section 11), so mistakes can be traced.

---

## 7. Overlays

Transparent background, 1920×1080 safe, readable on stream. Poll every 2 s (or SSE later). Same visual language as the existing `/obs` overlays.

**Main tracker** (`/main`, about 420×900, side panel):
- Team name and both members
- Timer, large, with a paused state that is clearly visible ("PAUSE")
- Progress "6 / 9"
- Current game, highlighted, with its goal and counter ("LoL Duo · 2/3 · Versuch 5")
- Full list: done ✓ (with the time it was done), open ○, current ▶
- Short animation when a game is done, bigger one at the finish ("FERTIG 🏁 41:23:07")
- Optional small line: "Pot: 24 Subs"

**Bar** (`/bar`, about 1920×80, bottom or top):
- Timer · current game and counter · "6/9" · rank ("Platz 2")

**Leaderboard overlay** (`/obs/winchallenge/leaderboard`):
- Top teams: rank, team, progress, time, live dot
- Optional rotation through all teams if there are many

Query options: `?scale=`, `?align=left|right`, `?hideList=1` for small layouts.

---

## 8. Leaderboard page (`/winchallenge`)

- Header: challenge name, start time or "läuft seit", number of teams and participants, pot ("24 Subs im Pot")
- Prominent **Mitmachen** button while sign-up is open
- Table: rank, team (both members), progress bar "6/9", running time, state (sucht Partner, bereit, läuft, Pause, fertig, aufgegeben), live on Twitch (link)
- Click a team to open `/winchallenge/team/[slug]` with all games and done times
- Game list section: every game with its goal
- "Letzte Ereignisse" feed: "Team X hat Minecraft Hardcore geschafft", "Team Y ist fertig"
- Live updates by polling (5 s)

Ranking:
1. Finished teams, by finish time (clock since the official start, incl. admin correction)
2. Then started teams: more games done first, then whoever reached that count first
3. Teams that never started, then gave-up teams last

Twitch live status: reuse `src/lib/twitch.ts`.

---

## 9. Stake and payout (Twitch subs)

The site never handles money. It only tells everyone whom to gift a sub to and tracks confirmations.

**Pot:** 1 sub per participant in a full duo, whether the team started, gave up or never started (user decision 2026-11-26). Solo players and half teams cannot play and owe nothing. To let a no-show team off, the admin removes the team before ending.

**When:** Lauchgruen presses **Challenge beenden** in admin once places 1–3 are decided (three teams finished, or he decides it is enough). The ranking is frozen at that moment.

**Split** (default 50 / 30 / 20, editable in admin before ending):
- Example with 20 participants: 1st place 10 subs (5 per member), 2nd place 6 (3 each), 3rd place 4 (2 each).
- Rounding: largest remainder, so the total always equals the pot. Odd numbers inside a team alternate between the two members.
- Fewer than 3 finished teams: the unused shares go to the places that exist (default).

**Assignment:** each paying participant gets exactly one recipient. Never a member of their own team. The assignment is computed once at the end, stored, and does not change afterwards (admin can reassign single entries).

**Where the sub goes:** a gifted sub is always for a channel. Every participant picks a **sub target** on the sign-up page: their own Twitch channel (default) or their partner's. Older free-text entries map to "partner" when they name the partner, else "self". Fallback: Lauchgruen's channel. The payer gifts 1 sub on that channel. On the partner's channel the gift goes to the recipient's Twitch name. On the recipient's own channel it goes to any viewer, because Twitch does not let a streamer receive a sub on their own channel.

**Einsatz page** (`/winchallenge/einsatz`), shown to every participant after the end:
- "Du schenkst: 1 Sub an **name** auf Kanal **kanal**", with a button to open the channel, and **Erledigt**.
- Winners also see "Du bekommst: 5 Subs" with a list of givers and the state of each (offen, bezahlt, bestätigt).
- The recipient can press **Erhalten** per giver. A gift counts as complete when the recipient confirms it (or the admin marks it).
- Every challenge page shows the payout state: "18/24 Subs verschenkt".

**Admin payout view:** table of all assignments with state, reminder hint for open ones, manual override, reassign.

**Public debt list** (user decision 2026-11-27): after the end, the leaderboard shows every sub that is not confirmed yet (payer, recipient, channel, state). The rule: whoever does not pay is banned from the next Win Challenge. Gifts must come from the linked Twitch account and must not be anonymous.

**Automatic check** (user decision 2026-11-27, `src/lib/winchallenge/subcheck.ts`): the owner of a payout channel connects it once on the Einsatz page (`/api/twitch/connect?purpose=subs`, scope `channel:read:subscriptions`, same registered callback). Only the Twitch account already linked to that Discord user can be connected. Tokens stay server-side in `winchallenge_sub_channels`. The check reads "Get Broadcaster Subscriptions" and confirms a payout when a gifted sub on its channel has the payer as `gifter_id` (one gift proves one payout). It runs after connecting, when a payer presses Erledigt, on "Jetzt prüfen" (throttled to 15 s per channel) and from admin. Limits: anonymous gifts cannot be matched, Twitch lists current subs only (about one month), and a gift the payer made on that channel before the end also counts. Manual confirm by recipient or admin still works.

**Note:** the stake is voluntary and among friends; the site only records who owes whom. Lauchgruen should make sure the rules box states the stake clearly before sign-up.

---

## 10. Admin (`/winchallenge/admin`)

- **Challenge setup**: name, start time, game list (add, edit, reorder for display, type, target), sign-up open or closed, sub split. Editing the list after the start shows a warning.
- **Participants and teams**: list, create teams, move players, regenerate join codes, remove players or teams. Works also after the start.
- **Corrections** per team, every change needs a reason and goes to the event log:
  - add or remove time (penalty or fix, e.g. "+10 min")
  - stop or start the timer
  - set counter, tries, done state of any game
  - undo "aufgegeben", undo "fertig"
- **End and payout**: freeze the ranking, compute assignments, track confirmations (section 9).
- **Event log**: every button press and admin change with time, user, before and after.
- **Archive**: freeze the challenge, leaderboard stays visible.

Use the existing patterns: `claimAdminVersion` for edit conflicts, `writeAuditLog` for admin actions, owner check via `TOURNAMENT_OWNER_DISCORD_IDS`.

---

## 11. Data (MongoDB)

New collections, all prefixed `winchallenge_`:

```ts
// winchallenge_challenges
{ _id: string; slug: string; name: string; startAt: string;
  status: "draft" | "open" | "ended" | "archived"; signupOpen: boolean;
  split: [number, number, number];                                    // percent, default [50, 30, 20]
  games: { id: string; title: string; goal: string; type: "check" | "counter"; target?: number; icon?: string }[];
  endedAt?: string; finalRanking?: string[];                          // team ids, frozen at the end
  createdAt: string; updatedAt: string }

// winchallenge_participants
{ _id: string; challengeId: string; discordId: string; discordName: string;
  twitchId: string; twitchLogin: string; subTarget?: "self" | "partner";
  teamId?: string; acceptedRulesAt: string; createdAt: string }       // unique (challengeId, discordId)

// winchallenge_teams
{ _id: string; challengeId: string; slug: string; name: string; joinCode: string;  // unique per challenge
  memberIds: string[];                                                // participant ids, max 2
  status: "forming" | "ready" | "running" | "paused" | "finished" | "gave-up";
  segments: { start: string; end?: string }[];                       // timer
  adjustMs: number;                                                   // admin correction
  finishedAt?: string; finalMs?: number;
  currentGameId?: string;
  progress: Record<string, { count: number; tries: number; doneAt?: string }>;
  version: number; createdAt: string; updatedAt: string }

// winchallenge_payouts
{ _id: string; challengeId: string; payerId: string; recipientId: string; channel: string; place: 1 | 2 | 3;
  status: "open" | "paid" | "confirmed"; paidAt?: string; confirmedAt?: string; confirmedBy?: string }

// winchallenge_events
{ _id: string; challengeId: string; teamId?: string; at: string; actor: string;
  kind: "signup" | "team-create" | "team-join" | "team-leave" | "start" | "pause" | "resume" | "done" | "undo"
      | "plus" | "minus" | "reset" | "current" | "gave-up" | "payout" | "admin";
  gameId?: string; before?: unknown; after?: unknown; reason?: string; liveCheck?: "live" | "offline" | "twitch-down" }
```

Rules in the server:
- All team writes are atomic `findOneAndUpdate` with `version` (two partners pressing at the same time must not lose a click).
- Joining a team is atomic: `memberIds` size < 2 in the filter.
- `start` refused before `startAt` (server time) and for teams that are not `ready`.
- Stream check for start, resume and progress (section 4).
- Running time = segments + `adjustMs`, never negative.
- Finish check after every progress change.
- Payout assignment computed once, in one transaction-like step, idempotent (pressing "beenden" twice does not double it).

---

## 12. API

```
GET  /api/winchallenge                         public: challenge, games, leaderboard, pot, payout progress
GET  /api/winchallenge/team/[slug]             public: one team
GET  /api/obs/winchallenge/[slug]              overlay data (+ serverNow)
GET  /api/obs/winchallenge/leaderboard         overlay data (+ serverNow)

GET  /api/winchallenge/me                      logged in: own participant, team, Twitch link state
POST /api/winchallenge/signup                  logged in: { acceptRules: true }
POST /api/winchallenge/team                    participant: { action: create | join | leave | new-code, name?, code? }
PATCH /api/winchallenge/me                     participant: { subTarget: self | partner }

POST /api/winchallenge/control                 team member: { action, gameId?, expectedVersion }
     actions: start | pause | resume | done | undo | plus | minus | reset | current | give-up

GET  /api/winchallenge/payout                  logged in: own gifts to make and to receive
POST /api/winchallenge/payout                  participant: { id, action: paid | confirm }

GET/POST/PATCH/DELETE /api/winchallenge/admin/...   owners: challenge, games, teams, corrections, end, payouts
```

Validation with zod, German error messages, `Cache-Control: no-store`.

---

## 13. Build order

1. **Pure logic with tests**: timer math, ranking, progress rules, finish detection, join codes, payout split and assignment (no self-team, totals add up, rounding). Tests in `tests/winchallenge*.test.mjs`.
2. **Data layer and API**: sign-up, teams, control (incl. stream check), public read, admin. Route tests like the existing ones.
3. **Admin page**: create challenge and games. Needed to test everything else.
4. **Sign-up page**: Discord + Twitch check, create or join team with code.
5. **Control panel** with copy-overlay buttons.
6. **Overlays**: main, bar, leaderboard.
7. **Leaderboard page** and team page.
8. **End and payout**: admin end button, Einsatz page, confirmations.
9. **proxy.ts** rules for `/winchallenge` and `/api/winchallenge` on the apex host, plus a link from the landing page.
10. **Local test run**: Docker mongo on port 27027 (never `.env.local`, that is prod), fake participants, full flow incl. late sign-up, team via code, stream check (mocked live state), pause overnight, admin time fix, finish, end, payout.
11. Deploy, create the real challenge in admin, open sign-up.

Rough effort: 4–5 days (sign-up, stream check and payout add about 2 days to the first plan).

---

## 14. Nice to have (later)

- Discord messages to a challenge channel (sign-up, game done, team finished, payout reminders)
- Auto-pause when no member is live for 10 minutes
- Stream Deck: secret per-member link for pause/resume and `+` (needs its own token, unlike the overlays)
- Sound in the overlay on "done"
- Per-game stats on the leaderboard ("schnellstes Team bei Minecraft")
- Second challenge later: reuse everything, only a new game list
