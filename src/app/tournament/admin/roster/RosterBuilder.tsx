"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  PlayerRole,
  RosterApplicant,
  RosterSnapshot,
  RosterTeam,
} from "@/lib/roster";
import { snakeFillAssignments } from "@/lib/snake-fill";
import { parseRank } from "@/lib/rank-score";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type SortMode = "rank-desc" | "rank-asc" | "role-available";

const SORT_OPTIONS: Array<{ value: SortMode; label: string; title: string }> = [
  { value: "rank-desc", label: "Elo ↓", title: "Höchster Rang zuerst" },
  { value: "rank-asc", label: "Elo ↑", title: "Niedrigster Rang zuerst" },
  { value: "role-available", label: "Rolle frei", title: "Wunschrolle ist in mindestens einem Team noch offen" },
];

function normalizeRoleName(raw: string): PlayerRole | null {
  const lower = raw.trim().toLowerCase();
  for (const role of ALL_ROLES) {
    if (role.toLowerCase() === lower) return role;
  }
  if (lower === "adc" || lower === "bot lane" || lower === "botlane") return "Bot";
  if (lower === "jg" || lower === "jng" || lower === "jgl") return "Jungle";
  if (lower === "supp") return "Support";
  return null;
}

const ROLES: PlayerRole[] = ["Top", "Jungle", "Mid", "Bot", "Support"];
const ALL_ROLES: PlayerRole[] = [...ROLES, "Fill", "Sub"];

type Assignment = {
  /** teamKey OR "" if unassigned */
  teamKey: string;
  role: PlayerRole | null;
};

type State = {
  /** discordId → assignment */
  assignments: Map<string, Assignment>;
  /** teamKey → captain discordId | null */
  captains: Map<string, string | null>;
};

function initialState(snapshot: RosterSnapshot): State {
  const assignments = new Map<string, Assignment>();
  for (const team of snapshot.teams) {
    for (const player of team.players) {
      if (!player.discordId) continue;
      assignments.set(player.discordId, {
        teamKey: team.key,
        role: player.role,
      });
    }
  }
  const captains = new Map<string, string | null>();
  for (const team of snapshot.teams) {
    captains.set(team.key, team.captainDiscordId);
  }
  return { assignments, captains };
}

export function RosterBuilder({ snapshot }: { snapshot: RosterSnapshot }) {
  const router = useRouter();
  const [state, setState] = useState<State>(() => initialState(snapshot));
  const [picker, setPicker] = useState<
    | null
    | { teamKey: string; role: PlayerRole }
  >(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    | null
    | { tone: "ok" | "error"; text: string }
  >(null);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("rank-desc");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamGroup, setNewTeamGroup] = useState<"A" | "B" | "">("");
  const [newTeamSeed, setNewTeamSeed] = useState<number | "">("");

  // Auto-dismiss "ok" toasts so they don't sit stuck after the next router
  // refresh. Errors stay until manually replaced.
  useEffect(() => {
    if (message?.tone !== "ok") return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const applicantById = useMemo(
    () => new Map(snapshot.applicants.map((a) => [a.discordId, a])),
    [snapshot.applicants],
  );

  const teamByKey = useMemo(
    () => new Map(snapshot.teams.map((t) => [t.key, t])),
    [snapshot.teams],
  );

  const playersByTeamRole = useMemo(() => {
    const map = new Map<string, Map<PlayerRole, string[]>>();
    for (const team of snapshot.teams) {
      map.set(team.key, new Map());
    }
    for (const [discordId, assignment] of state.assignments) {
      if (!assignment.teamKey) continue;
      const teamMap = map.get(assignment.teamKey);
      if (!teamMap) continue;
      const role = assignment.role ?? "Fill";
      if (!teamMap.has(role)) teamMap.set(role, []);
      teamMap.get(role)!.push(discordId);
    }
    return map;
  }, [snapshot.teams, state.assignments]);

  /** Roles that still have at least one open slot somewhere across all teams. */
  const openRolesAnywhere = useMemo(() => {
    const open = new Set<PlayerRole>();
    for (const team of snapshot.teams) {
      const filled = playersByTeamRole.get(team.key) ?? new Map();
      for (const role of ROLES) {
        if ((filled.get(role) ?? []).length === 0) open.add(role);
      }
    }
    return open;
  }, [snapshot.teams, playersByTeamRole]);

  const unassigned = useMemo(() => {
    const base = snapshot.applicants.filter(
      (a) => !state.assignments.has(a.discordId) || state.assignments.get(a.discordId)?.teamKey === "",
    );
    const sorted = [...base];
    if (sortMode === "rank-desc") {
      sorted.sort((a, b) => parseRank(b.currentRank) - parseRank(a.currentRank));
    } else if (sortMode === "rank-asc") {
      sorted.sort((a, b) => parseRank(a.currentRank) - parseRank(b.currentRank));
    } else {
      // role-available: applicants whose preferred role has an open slot float first
      sorted.sort((a, b) => {
        const aHas = a.preferredRoles.some((r) => {
          const role = normalizeRoleName(r);
          return role !== null && openRolesAnywhere.has(role);
        });
        const bHas = b.preferredRoles.some((r) => {
          const role = normalizeRoleName(r);
          return role !== null && openRolesAnywhere.has(role);
        });
        if (aHas !== bHas) return aHas ? -1 : 1;
        return parseRank(b.currentRank) - parseRank(a.currentRank);
      });
    }
    return sorted;
  }, [snapshot.applicants, state.assignments, sortMode, openRolesAnywhere]);

  function assignPlayer(discordId: string, teamKey: string, role: PlayerRole) {
    setState((prev) => {
      const next = new Map(prev.assignments);
      next.set(discordId, { teamKey, role });
      return { ...prev, assignments: next };
    });
  }

  function unassignPlayer(discordId: string) {
    setState((prev) => {
      const next = new Map(prev.assignments);
      next.set(discordId, { teamKey: "", role: null });
      // Also clear captain if they were one
      const captains = new Map(prev.captains);
      for (const [tk, cid] of captains) {
        if (cid === discordId) captains.set(tk, null);
      }
      return { assignments: next, captains };
    });
  }

  function setRole(discordId: string, role: PlayerRole) {
    setState((prev) => {
      const current = prev.assignments.get(discordId);
      if (!current || !current.teamKey) return prev;
      const next = new Map(prev.assignments);
      next.set(discordId, { ...current, role });
      return { ...prev, assignments: next };
    });
  }

  function toggleCaptain(teamKey: string, discordId: string) {
    setState((prev) => {
      const captains = new Map(prev.captains);
      captains.set(teamKey, captains.get(teamKey) === discordId ? null : discordId);
      return { ...prev, captains };
    });
  }

  async function runAutoBalance() {
    setAutoConfirm(false);
    setAutoRunning(true);
    setMessage(null);
    const assignments = snakeFillAssignments(snapshot.applicants, snapshot.teams);

    // Clear everything first.
    setState((prev) => ({
      ...prev,
      assignments: new Map(
        snapshot.applicants.map((a) => [a.discordId, { teamKey: "", role: null }]),
      ),
      captains: new Map([...prev.captains].map(([k]) => [k, null])),
    }));
    await new Promise((r) => setTimeout(r, 220));

    // Apply assignments one at a time with a small delay for visual rhythm.
    for (const a of assignments) {
      assignPlayer(a.discordId, a.teamKey, a.role);
      setPulseId(a.discordId);
      // Pulse fades after a moment; stagger between assignments
      await new Promise((r) => setTimeout(r, 90));
    }
    setPulseId(null);
    setAutoRunning(false);
    setMessage({
      tone: "ok",
      text: `Snake-Draft hat ${assignments.length} Spieler auf ${snapshot.teams.length} Team(s) verteilt. Prüfen und speichern, wenn alles passt.`,
    });
  }

  async function createTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    setCreating(true);
    setMessage(null);
    const response = await fetch("/api/tournament/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        group: newTeamGroup || undefined,
        seed: newTeamSeed === "" ? undefined : newTeamSeed,
      }),
    });
    setCreating(false);
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage({
        tone: "error",
        text: json?.message ?? "Team konnte nicht erstellt werden.",
      });
      return;
    }
    setNewTeamName("");
    setNewTeamGroup("");
    setNewTeamSeed("");
    setCreateOpen(false);
    setMessage({
      tone: "ok",
      text: `Team „${json.name}" erstellt.`,
    });
    router.refresh();
  }

  async function seedTestData() {
    setSeeding(true);
    setMessage(null);
    const response = await fetch("/api/tournament/test-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 40 }),
    });
    setSeeding(false);
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage({
        tone: "error",
        text: json?.message ?? "Test-Daten konnten nicht angelegt werden.",
      });
      return;
    }
    const parts: string[] = [];
    if (json.applicants) parts.push(`${json.applicants} Bewerber`);
    if (json.teamsInserted) parts.push(`${json.teamsInserted} Team(s) angelegt`);
    if (json.teamsAlreadyFull) parts.push("Teams sind bereits voll (8)");
    setMessage({
      tone: "ok",
      text: `Test-Daten gesetzt: ${parts.join(", ")}.`,
    });
    router.refresh();
  }

  async function clearTestData() {
    setClearing(true);
    setMessage(null);
    const response = await fetch("/api/tournament/test-data", { method: "DELETE" });
    setClearing(false);
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage({
        tone: "error",
        text: json?.message ?? "Test-Daten konnten nicht gelöscht werden.",
      });
      return;
    }
    const parts: string[] = [
      `${json.applications} Bewerbung(en)`,
      `${json.teamsRemoved} Team(s)`,
    ];
    if (json.playersStripped) parts.push(`${json.playersStripped} Dummy-Spieler aus echten Teams entfernt`);
    setMessage({
      tone: "ok",
      text: `Gelöscht: ${parts.join(", ")}.`,
    });
    router.refresh();
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const teamPlayers: Record<string, Array<{ discordId: string; role: PlayerRole | null }>> = {};
    for (const team of snapshot.teams) {
      teamPlayers[team.key] = [];
    }
    for (const [discordId, assignment] of state.assignments) {
      if (!assignment.teamKey) continue;
      teamPlayers[assignment.teamKey]?.push({
        discordId,
        role: assignment.role,
      });
    }
    const captains: Record<string, string | null> = {};
    for (const [teamKey, captainId] of state.captains) {
      captains[teamKey] = captainId;
    }
    const response = await fetch("/api/tournament/roster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamPlayers, captains }),
    });
    setSaving(false);
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const errs = (json?.errors as string[] | undefined) ?? [json?.message ?? "Save failed."];
      setMessage({ tone: "error", text: errs.join(" · ") });
      return;
    }
    setMessage({
      tone: "ok",
      text: `Saved · ${json.applied} players across ${json.teamsUpdated} team(s).`,
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <aside className="flex flex-col rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/64">
            Nicht zugewiesen
          </div>
          <div className="text-xs font-bold text-emerald-100/52">
            {unassigned.length}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {SORT_OPTIONS.map((opt) => {
            const active = sortMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSortMode(opt.value)}
                title={opt.title}
                className={`rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] transition ${
                  active
                    ? "border-lime-200/40 bg-lime-200/14 text-lime-50"
                    : "border-white/10 bg-black/24 text-emerald-100/60 hover:border-lime-200/24 hover:text-lime-100"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1">
          {unassigned.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-black/24 p-3 text-xs text-emerald-100/52">
              Alle verifizierten Bewerber sind zugewiesen.
            </div>
          ) : (
            unassigned.map((a) => (
              <ApplicantCard
                key={a.discordId}
                applicant={a}
                compact
              />
            ))
          )}
        </div>
      </aside>

      <main className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/64">
            Teams · {snapshot.teams.length}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {message ? (
              <div
                className={`rounded-xl border px-3 py-1.5 text-xs ${
                  message.tone === "ok"
                    ? "border-lime-200/30 bg-lime-200/10 text-lime-50"
                    : "border-red-300/30 bg-red-500/10 text-red-100"
                }`}
              >
                {message.text}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={creating || autoRunning}
              title="Neues Team direkt im Bot anlegen (alternativ zum /createteam-Slash-Command)"
              className="rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100 disabled:opacity-50"
            >
              + Team anlegen
            </button>
            <button
              type="button"
              onClick={seedTestData}
              disabled={seeding || autoRunning}
              title="40 Dummy-Bewerber + Dummy-Teams einfügen, sodass insgesamt 8 Teams existieren (echte Teams bleiben unangetastet)"
              className="rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100 disabled:opacity-50"
            >
              {seeding ? "Wird angelegt…" : "+ Test-Daten"}
            </button>
            <button
              type="button"
              onClick={clearTestData}
              disabled={clearing || autoRunning}
              title="Alle mit isTestData:true markierten Bewerber + Teams löschen (echte Einträge bleiben)"
              className="rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-rose-200/30 hover:text-rose-200 disabled:opacity-50"
            >
              {clearing ? "Wird gelöscht…" : "Test-Daten löschen"}
            </button>
            <button
              type="button"
              onClick={() => setAutoConfirm(true)}
              disabled={autoRunning || saving}
              className="rounded-xl border border-lime-200/30 bg-lime-200/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-lime-50 transition hover:border-lime-200/60 disabled:opacity-50"
            >
              {autoRunning ? "Snake-Draft läuft…" : "⚡ Auto-Balance"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || autoRunning}
              className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              {saving ? "Speichern…" : "Roster speichern"}
            </button>
          </div>
        </div>

        {snapshot.teams.length === 0 ? (
          <div className="rounded-[1.8rem] border border-amber-200/24 bg-amber-200/[0.08] p-6 text-sm leading-7 text-amber-50">
            Noch keine Teams im Bot. Lege oben über{" "}
            <strong className="font-black">„+ Team anlegen“</strong> dein erstes
            Team an oder erstelle sie via{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5">/createteam</code>{" "}
            in Discord.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.teams.map((team) => (
            <TeamCard
              key={team.key}
              team={team}
              playersByRole={playersByTeamRole.get(team.key) ?? new Map()}
              applicantById={applicantById}
              captainId={state.captains.get(team.key) ?? null}
              pulsingId={pulseId}
              onAssignClick={(role) => setPicker({ teamKey: team.key, role })}
              onUnassign={unassignPlayer}
              onSetRole={setRole}
              onToggleCaptain={(discordId) => toggleCaptain(team.key, discordId)}
            />
          ))}
        </div>
      </main>

      {picker ? (
        <Picker
          teamName={teamByKey.get(picker.teamKey)?.name ?? picker.teamKey}
          role={picker.role}
          candidates={unassigned}
          onCancel={() => setPicker(null)}
          onPick={(discordId) => {
            assignPlayer(discordId, picker.teamKey, picker.role);
            setPicker(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={autoConfirm}
        title="Roster automatisch ausbalancieren?"
        description={
          <>
            Das löscht jede aktuelle Zuweisung und füllt per Snake-Draft nach
            Rang neu auf. Wunschrollen werden berücksichtigt, sofern der Slot
            frei ist. <strong className="text-emerald-50">Captains werden zurückgesetzt.</strong>
            {" "}Du kannst danach manuell anpassen, bevor du speicherst.
          </>
        }
        confirmLabel="Teams snake-füllen"
        cancelLabel="Abbrechen"
        onConfirm={runAutoBalance}
        onCancel={() => setAutoConfirm(false)}
      />

      {createOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center px-5"
        >
          <button
            type="button"
            aria-label="Schließen"
            onClick={() => setCreateOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md rounded-[1.7rem] border border-white/12 bg-gradient-to-br from-emerald-950/95 via-emerald-950/95 to-black/95 p-5 shadow-2xl shadow-black/40">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/72">
              Neues Team
            </div>
            <h2 className="mt-2 text-lg font-black text-emerald-50">Team anlegen</h2>
            <p className="mt-1 text-xs text-emerald-100/52">
              Wird direkt im Bot (bot_state.teams) gespeichert — gleicher
              Effekt wie der <code className="rounded bg-black/40 px-1 py-0.5">/createteam</code>-Befehl.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">
                  Teamname
                </span>
                <input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="z. B. Sprout Squad"
                  className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/30 focus:border-lime-200/40"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">
                    Gruppe (optional)
                  </span>
                  <select
                    value={newTeamGroup}
                    onChange={(e) => setNewTeamGroup(e.target.value as "A" | "B" | "")}
                    className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50"
                  >
                    <option value="">—</option>
                    <option value="A">Gruppe A</option>
                    <option value="B">Gruppe B</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/64">
                    Seed (optional)
                  </span>
                  <select
                    value={newTeamSeed}
                    onChange={(e) => setNewTeamSeed(e.target.value === "" ? "" : Number(e.target.value))}
                    className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50"
                  >
                    <option value="">—</option>
                    <option value="1">Seed 1</option>
                    <option value="2">Seed 2</option>
                    <option value="3">Seed 3</option>
                    <option value="4">Seed 4</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-100"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={createTeam}
                disabled={creating || !newTeamName.trim()}
                className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 disabled:opacity-60"
              >
                {creating ? "Wird erstellt…" : "Team erstellen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* One-shot pulse animation when the auto-fill highlights a new assignment */}
      <style>{`
        @keyframes roster-row-pop {
          0%   { background-color: rgba(190, 242, 100, 0.28); }
          100% { background-color: transparent; }
        }
        .roster-row-pulse {
          animation: roster-row-pop 800ms ease-out;
        }
      `}</style>
    </div>
  );
}

function TeamCard({
  team,
  playersByRole,
  applicantById,
  captainId,
  pulsingId,
  onAssignClick,
  onUnassign,
  onSetRole,
  onToggleCaptain,
}: {
  team: RosterTeam;
  playersByRole: Map<PlayerRole, string[]>;
  applicantById: Map<string, RosterApplicant>;
  captainId: string | null;
  pulsingId: string | null;
  onAssignClick: (role: PlayerRole) => void;
  onUnassign: (discordId: string) => void;
  onSetRole: (discordId: string, role: PlayerRole) => void;
  onToggleCaptain: (discordId: string) => void;
}) {
  return (
    <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-black text-emerald-50">{team.name}</div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">
            {team.group ? `Gruppe ${team.group}` : "Keine Gruppe"}
            {team.seed ? ` · Seed ${team.seed}` : ""}
          </div>
        </div>
      </header>

      <div className="mt-3 grid gap-2">
        {ROLES.map((role) => {
          const slots = playersByRole.get(role) ?? [];
          if (slots.length === 0) {
            return (
              <button
                key={role}
                type="button"
                onClick={() => onAssignClick(role)}
                className="flex w-full items-center justify-between rounded-xl border border-dashed border-white/14 bg-black/12 px-3 py-2 text-left text-xs font-bold text-emerald-100/52 transition hover:border-lime-200/40 hover:text-lime-100"
              >
                <span className="font-black uppercase tracking-[0.22em] text-lime-200/52">
                  {role}
                </span>
                <span>+ Zuweisen</span>
              </button>
            );
          }
          return slots.map((discordId) => {
            const applicant = applicantById.get(discordId);
            return (
              <PlayerRow
                key={`${role}-${discordId}`}
                discordId={discordId}
                applicant={applicant}
                role={role}
                isCaptain={captainId === discordId}
                pulsing={pulsingId === discordId}
                onUnassign={() => onUnassign(discordId)}
                onSetRole={(r) => onSetRole(discordId, r)}
                onToggleCaptain={() => onToggleCaptain(discordId)}
              />
            );
          });
        })}

        {/* Fill / Sub buckets (shown only if used) */}
        {(["Fill", "Sub"] as PlayerRole[]).map((role) => {
          const slots = playersByRole.get(role) ?? [];
          if (slots.length === 0) return null;
          return slots.map((discordId) => {
            const applicant = applicantById.get(discordId);
            return (
              <PlayerRow
                key={`${role}-${discordId}`}
                discordId={discordId}
                applicant={applicant}
                role={role}
                isCaptain={captainId === discordId}
                pulsing={pulsingId === discordId}
                onUnassign={() => onUnassign(discordId)}
                onSetRole={(r) => onSetRole(discordId, r)}
                onToggleCaptain={() => onToggleCaptain(discordId)}
              />
            );
          });
        })}
      </div>
    </article>
  );
}

function PlayerRow({
  discordId,
  applicant,
  role,
  isCaptain,
  pulsing,
  onUnassign,
  onSetRole,
  onToggleCaptain,
}: {
  discordId: string;
  applicant: RosterApplicant | undefined;
  role: PlayerRole;
  isCaptain: boolean;
  pulsing?: boolean;
  onUnassign: () => void;
  onSetRole: (role: PlayerRole) => void;
  onToggleCaptain: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
        isCaptain
          ? "border-lime-200/40 bg-lime-200/10"
          : "border-white/10 bg-black/24"
      } ${pulsing ? "roster-row-pulse" : ""}`}
    >
      <select
        value={role}
        onChange={(event) => onSetRole(event.target.value as PlayerRole)}
        className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-lime-200/72"
      >
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black text-emerald-50">
          {applicant?.discordUsername
            ? `@${applicant.discordUsername}`
            : applicant?.discordHandle ?? discordId}
        </div>
        <div className="truncate text-[10px] text-emerald-100/52">
          {applicant?.riotId ?? "(no riot id)"}
          {applicant?.currentRank ? ` · ${applicant.currentRank}` : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleCaptain}
        title={isCaptain ? "Captain entfernen" : "Zum Captain machen"}
        className={`rounded-md border px-1.5 py-1 text-xs ${
          isCaptain
            ? "border-lime-200/40 bg-lime-200/14 text-lime-50"
            : "border-white/12 bg-black/24 text-emerald-100/52 hover:text-lime-100"
        }`}
      >
        ⭐
      </button>
      <button
        type="button"
        onClick={onUnassign}
        title="Vom Team entfernen"
        className="rounded-md border border-white/12 bg-black/24 px-1.5 py-1 text-xs text-emerald-100/52 hover:text-red-200"
      >
        ✕
      </button>
    </div>
  );
}

function ApplicantCard({ applicant }: { applicant: RosterApplicant; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/22 p-3">
      <div className="truncate text-sm font-black text-emerald-50">
        {applicant.discordUsername
          ? `@${applicant.discordUsername}`
          : applicant.discordHandle}
      </div>
      <div className="truncate text-[10px] text-emerald-100/52">{applicant.riotId}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {applicant.currentRank ? (
          <span className="rounded-full border border-lime-200/24 bg-lime-200/10 px-2 py-0.5 text-[10px] font-bold text-lime-50">
            {applicant.currentRank}
          </span>
        ) : null}
        {applicant.preferredRoles.slice(0, 3).map((r) => (
          <span
            key={r}
            className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60"
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

function Picker({
  teamName,
  role,
  candidates,
  onCancel,
  onPick,
}: {
  teamName: string;
  role: PlayerRole;
  candidates: RosterApplicant[];
  onCancel: () => void;
  onPick: (discordId: string) => void;
}) {
  // Mark applicants who preferred this role.
  const decorated = candidates
    .map((a) => ({
      applicant: a,
      preferred: a.preferredRoles.some(
        (r) => r.toLowerCase() === role.toLowerCase(),
      ),
    }))
    .sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      // Fall back to alphabetical by display name
      return (a.applicant.discordUsername ?? "").localeCompare(
        b.applicant.discordUsername ?? "",
      );
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center px-5"
    >
      <button
        type="button"
        aria-label="Schließen"
        onClick={onCancel}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md rounded-[1.7rem] border border-white/12 bg-gradient-to-br from-emerald-950/95 via-emerald-950/95 to-black/95 p-5 shadow-2xl shadow-black/40">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/72">
          Zuweisen · {role}
        </div>
        <h2 className="mt-2 text-lg font-black text-emerald-50">{teamName}</h2>

        <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
          {decorated.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/24 p-4 text-sm text-emerald-100/52">
              Keine verfügbaren verifizierten Bewerber mehr.
            </div>
          ) : (
            <div className="grid gap-2">
              {decorated.map(({ applicant, preferred }) => (
                <button
                  key={applicant.discordId}
                  type="button"
                  onClick={() => onPick(applicant.discordId)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    preferred
                      ? "border-lime-200/30 bg-lime-200/[0.06] hover:border-lime-200/50"
                      : "border-white/10 bg-black/24 hover:border-lime-200/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-emerald-50">
                      {applicant.discordUsername
                        ? `@${applicant.discordUsername}`
                        : applicant.discordHandle}
                      {preferred ? (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.18em] text-lime-200/72">
                          👍 Wunschrolle
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-[10px] text-emerald-100/52">
                      {applicant.riotId}
                      {applicant.currentRank ? ` · ${applicant.currentRank}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-100"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
