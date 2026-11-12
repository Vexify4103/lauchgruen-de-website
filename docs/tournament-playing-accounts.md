# Organizer-approved playing accounts

Under **Admin > Bewerbungen > Bewerbung bearbeiten > Turnier-Spielaccount**, owners can approve an alternate League account without requiring a player-side icon challenge.

1. Enter the playing Riot ID and a reason (at least five characters).
2. Explicitly confirm the organizer approval and confirm the dialog.
3. The server resolves the real PUUID and checks that the League account exists on the configured tournament platform, is not tournament-blacklisted, and is not assigned to another participant.
4. Public rosters, captain pages, roster-builder identities and new replay uploads immediately use that playing identity. No roster publication, team-role update or DM is triggered.

The approval label **Orga-Freigabe** is shown only in admin, not as an ownership-verification badge on public team cards. Public pages keep the familiar player name and show **Spielaccount: Name#Tag** underneath when an alternate account is active. The original linked/verified account, application ID, scouting link, role preferences, main-account balancing rank, team membership and captain's Discord identity are unchanged. Normal profile refreshes continue to refresh the main account, not the lower-ranked playing account.

## Storage and scope

Approvals are kept separately in `tournament_playing_accounts`, keyed by active tournament ID and Discord ID. Each includes the PUUID, canonical Riot ID, scouting fallback, approving owner, reason and timestamp. A unique tournament/PUUID index prevents concurrent duplicate approvals. Updates use the existing admin-version conflict protection and audit log.

Readers derive the playing identity from the canonical roster plus the active tournament's approvals. The bot's canonical `bot_state` roster, private roster draft and permanent account links are not rewritten. This makes roster re-publication and approval resets safe; no copy needs to be synchronized or rolled back. The separate legacy Discord bot does not read these website overrides; its old API autoscan/account commands are not the replay validator and are not modified by this feature.

Replay uploads still run the existing server-side evaluator. The published roster is resolved through the same identity helper as the public pages; unrelated PUUIDs are not added as aliases. Previously saved replay evaluations are never re-evaluated automatically.

**Zurueck zum verknuepften Account** removes only the current tournament's approval. When the active tournament ID changes, previous approvals no longer apply. Re-enter and explicitly approve the account for a future tournament if needed. Use a new tournament ID for a new event; merely renaming an existing event does not create a new scope.

## Existing cases

- Emil already has `EmilSchmemil#Poro` as his playing account and `l111l111l#EUW` as his scouting override. No new approval is necessary while these are his current stored accounts.
- For kami, approve `Pavadon#EUW`; the existing `Kami#MUNDO` account remains the scouting and balancing identity.

Installing this feature does not approve either account or change any live participant records. All approvals remain explicit owner actions.
