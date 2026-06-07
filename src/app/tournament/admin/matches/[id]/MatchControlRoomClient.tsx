"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { ControlMatch } from "@/lib/match-control";
import type { ChampionPool } from "@/lib/champion-pools";
import type { TournamentTeam } from "@/lib/tournament-data";
import type { RosterSnapshot } from "@/lib/roster";
import {
  createDraftSequence,
  draftComplete,
  draftReady,
  type DraftSide,
  type TournamentDraftState,
} from "@/lib/tournament-draft-shared";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { ThemedSelect } from "@/components/ThemedSelect";

const statuses = ["Scheduled", "Live", "Finished", "Pending", "Locked"] as const;

function opggMultiSearchUrl(riotIds: string[]) {
  const uniqueIds = [...new Set(riotIds.filter(Boolean))];
  const params = new URLSearchParams({
    summoners: uniqueIds.length > 0 ? `${uniqueIds.join(", ")},` : "",
  });
  return `https://op.gg/lol/multisearch/euw?${params.toString()}`;
}

function teamRiotIds(team: TournamentTeam | null) {
  return team?.players.map((player) => player.riotId) ?? [];
}

export function MatchControlRoomClient({
  match,
  teamA,
  teamB,
  pools,
  draft,
  extraBanSide,
  roster,
  tournamentLive,
  draftEnabled,
}: {
  match: ControlMatch;
  teamA: TournamentTeam | null;
  teamB: TournamentTeam | null;
  pools: ChampionPool[];
  draft: TournamentDraftState;
  extraBanSide: DraftSide | null;
  roster: RosterSnapshot;
  tournamentLive: boolean;
  draftEnabled: boolean;
}) {
  const router = useRouter();
  const [scoreA, setScoreA] = useState(match.scoreA?.toString() ?? "");
  const [scoreB, setScoreB] = useState(match.scoreB?.toString() ?? "");
  const [status, setStatus] = useState<(typeof statuses)[number]>(
    (match.status ?? "Scheduled") as (typeof statuses)[number],
  );
  const [blueSide, setBlueSide] = useState<"teamA" | "teamB">(match.blueSide);
  const [teamAChampions, setTeamAChampions] = useState(match.teamAChampions ?? []);
  const [teamBChampions, setTeamBChampions] = useState(match.teamBChampions ?? []);
  const [message, setMessage] = useState("");
  const [coinTossing, setCoinTossing] = useState(false);
  const [coinWinner, setCoinWinner] = useState<"teamA" | "teamB">(match.blueSide);
  const [isPending, startTransition] = useTransition();

  const canDraw = Boolean(teamA && teamB && !match.poolAssignment && status !== "Finished");
  const canStart = Boolean(teamA && teamB && status !== "Finished" && tournamentLive);
  const poolA = match.poolAssignment?.teamAPool ?? null;
  const poolB = match.poolAssignment?.teamBPool ?? null;
  const allowedA = poolA ? pools.find((pool) => pool.pool === poolA)?.champions ?? [] : [];
  const allowedB = poolB ? pools.find((pool) => pool.pool === poolB)?.champions ?? [] : [];
  const draftSequence = createDraftSequence(extraBanSide);

  function drawPools() {
    if (!teamA || !teamB || isPending) return;
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/tournament/wheel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "spin",
          matchId: match.id,
          teamAName: teamA.name,
          teamBName: teamB.name,
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(json?.message ?? "Pools konnten nicht gezogen werden.");
        return;
      }
      setMessage("Pools gezogen.");
      router.refresh();
    });
  }

  function startMatch() {
    if (!canStart || isPending) return;
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/tournament/matches/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: match.id }),
      });
      const json = (await response.json().catch(() => null)) as
        | { message?: string; drewPools?: boolean }
        | null;
      if (!response.ok) {
        setMessage(json?.message ?? "Match konnte nicht gestartet werden.");
        return;
      }
      setStatus("Live");
      setMessage(json?.drewPools ? "Match gestartet und Pools gezogen." : "Match gestartet.");
      router.refresh();
    });
  }

  function saveMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/tournament/matches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: match.id,
          scoreA,
          scoreB,
          status,
          teamAChampions,
          teamBChampions,
          blueSide,
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(json?.message ?? "Match konnte nicht gespeichert werden.");
        return;
      }
      setMessage("Match gespeichert.");
      router.refresh();
    });
  }

  function tossCoin() {
    if (coinTossing) return;
    setMessage("");
    setCoinTossing(true);
    const winner = Math.random() < 0.5 ? "teamA" : "teamB";
    window.setTimeout(() => {
      setCoinWinner(winner);
      setCoinTossing(false);
      setMessage(`${winner === "teamA" ? match.teamALabel : match.teamBLabel} gewinnt den Coin Toss und darf Blue oder Red Side wählen.`);
    }, 1400);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="grid content-start gap-5">
        <div className="rounded-[2rem] border border-lime-200/12 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
                {match.phase === "groups" ? "Gruppenphase" : "Playoffs"} · {match.id}
              </div>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-emerald-50">
                {match.teamALabel} vs {match.teamBLabel}
              </h1>
              <p className="mt-3 text-sm font-bold text-emerald-100/54">
                {match.round} · {match.time}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 md:w-auto md:shrink-0 md:justify-end">
            <Link
              href="/tournament/admin"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.045] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/72 transition hover:border-lime-200/26 hover:text-lime-100 md:flex-none"
            >
              Zurück
            </Link>
            <Link
              href={`/tournament/champ-select/${match.id}/spectate`}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.16em] transition md:flex-none ${
                draftEnabled
                  ? "border-sky-200/16 bg-sky-300/8 text-sky-100 hover:border-sky-200/34"
                  : "pointer-events-none border-white/8 bg-white/[0.025] text-emerald-100/30"
              }`}
            >
              {draftEnabled ? "Spectator Draft" : "Draft pausiert"}
            </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <TeamPanel side="Team A" team={teamA} pool={poolA} fallback={match.teamALabel} />
          <TeamPanel side="Team B" team={teamB} pool={poolB} fallback={match.teamBLabel} />
        </div>

        {match.poolAssignment ? (
          <div className="grid gap-5 xl:grid-cols-2">
            <ChampionPicker
              title={`${match.teamALabel} · gespielte Champions`}
              champions={allowedA}
              selected={teamAChampions}
              onChange={setTeamAChampions}
            />
            <ChampionPicker
              title={`${match.teamBLabel} · gespielte Champions`}
              champions={allowedB}
              selected={teamBChampions}
              onChange={setTeamBChampions}
            />
          </div>
        ) : null}
      </section>

      <aside className="grid content-start gap-5">
        <LobbyChecklist
          poolsDrawn={Boolean(match.poolAssignment)}
          captainsReady={draftReady(draft)}
          draftComplete={draftComplete(draft, draftSequence)}
          scoreSaved={scoreA !== "" && scoreB !== ""}
          matchFinished={status === "Finished"}
        />

        <button
          type="button"
          onClick={startMatch}
          disabled={!canStart || isPending || status === "Live"}
          className="rounded-[1.4rem] bg-gradient-to-r from-red-200 via-amber-200 to-lime-200 px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-amber-300/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "Live" ? "Match ist live" : "Match starten"}
        </button>
        {!tournamentLive ? (
          <div className="rounded-2xl border border-amber-200/18 bg-amber-200/8 px-4 py-3 text-xs font-bold leading-5 text-amber-50/80">
            Turniermodus steht auf Vorbereitung. Match starten ist blockiert, bis du im Admin-Dashboard auf Live stellst.
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 shadow-xl shadow-black/24">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">
            A-Z Pools
          </div>
          {match.poolAssignment ? (
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-sky-200/16 bg-sky-300/8 p-3">
                <div className="text-xs font-bold text-emerald-100/54">Blue Side</div>
                <div className="mt-1 text-lg font-black text-sky-100">
                  {blueSide === "teamA" ? match.teamALabel : match.teamBLabel}
                </div>
              </div>
              <PoolBadge label={match.poolAssignment.teamAName} pool={match.poolAssignment.teamAPool} />
              <PoolBadge label={match.poolAssignment.teamBName} pool={match.poolAssignment.teamBPool} />
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-emerald-100/56">
              Noch keine Pools gezogen. Ziehe sie hier direkt für dieses Match.
            </p>
          )}
          <button
            type="button"
            onClick={drawPools}
            disabled={!canDraw || isPending}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {match.poolAssignment ? "Pools vorhanden" : "Pools ziehen"}
          </button>
        </div>

        <form
          onSubmit={saveMatch}
          className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24"
        >
          <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">
            Score
          </div>
          <div className="mt-4 grid gap-3">
            <ScoreField
              label={match.teamALabel}
              value={scoreA}
              onChange={setScoreA}
            />
            <ScoreField
              label={match.teamBLabel}
              value={scoreB}
              onChange={setScoreB}
            />
          </div>
          <div className="mt-4 grid gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100/52">
              Blue Side
            </span>
            <ThemedSelect
              name="blueSide"
              value={blueSide}
              onChange={(value) => setBlueSide(value as "teamA" | "teamB")}
              options={[
                { value: "teamA", label: match.teamALabel },
                { value: "teamB", label: match.teamBLabel },
              ]}
            />
            <CoinTossButton
              teamALabel={match.teamALabel}
              teamBLabel={match.teamBLabel}
              winner={coinWinner}
              tossing={coinTossing}
              disabled={isPending}
              onToss={tossCoin}
            />
            <p className="text-xs leading-5 text-emerald-100/42">
              Coin Toss bestimmt nur, wer die Side wählen darf. Danach hier Blue Side nach Wunsch des Gewinnerteams setzen und speichern.
            </p>
          </div>
          <div className="mt-4 grid gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100/52">
              Status
            </span>
            <ThemedSelect
              name="status"
              value={status}
              onChange={(value) => setStatus(value as (typeof statuses)[number])}
              options={statuses.map((value) => ({ value, label: value }))}
            />
          </div>
          <ProtectionWarnings
            hasPools={Boolean(match.poolAssignment)}
            draftReady={draftReady(draft)}
            draftComplete={draftComplete(draft, draftSequence)}
            blueSideChanged={blueSide !== match.blueSide}
            status={status}
          />
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 w-full rounded-2xl border border-lime-200/20 bg-lime-200/12 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-lime-50 transition hover:border-lime-200/40 disabled:opacity-50"
          >
            Speichern
          </button>
        </form>

        {message ? (
          <div className="rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">
            {message}
          </div>
        ) : null}

        <EmergencySubPanel
          match={match}
          roster={roster}
          onMessage={setMessage}
        />
      </aside>
    </div>
  );
}

function ProtectionWarnings({
  hasPools,
  draftReady,
  draftComplete,
  blueSideChanged,
  status,
}: {
  hasPools: boolean;
  draftReady: boolean;
  draftComplete: boolean;
  blueSideChanged: boolean;
  status: string;
}) {
  const warnings = [
    hasPools && status !== "Finished"
      ? "Pools sind bereits gezogen. Ein erneuter Spin ist absichtlich blockiert, bis das Match beendet ist."
      : "",
    blueSideChanged && (draftReady || draftComplete)
      ? "Blue Side wurde geaendert, aber der Draft hat schon begonnen. Draft danach ggf. resetten."
      : "",
    draftComplete && status !== "Finished"
      ? "Draft ist abgeschlossen. Nach Score-Eingabe Match als Finished speichern."
      : "",
  ].filter(Boolean);
  if (warnings.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-amber-200/18 bg-amber-200/8 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/70">
        Schutz-Hinweise
      </div>
      <div className="mt-2 grid gap-2">
        {warnings.map((warning) => (
          <p key={warning} className="text-xs font-bold leading-5 text-amber-50/78">
            {warning}
          </p>
        ))}
      </div>
    </div>
  );
}

function ScoreField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3 rounded-2xl border border-white/8 bg-black/16 p-3">
      <span
        className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100/52"
        title={label}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        min="0"
        className="w-full rounded-xl border border-white/10 bg-black/24 px-3 py-2.5 text-center text-sm font-black text-emerald-50 outline-none focus:border-lime-200/40"
      />
    </label>
  );
}

function LobbyChecklist({
  poolsDrawn,
  captainsReady,
  draftComplete,
  scoreSaved,
  matchFinished,
}: {
  poolsDrawn: boolean;
  captainsReady: boolean;
  draftComplete: boolean;
  scoreSaved: boolean;
  matchFinished: boolean;
}) {
  const items = [
    { label: "Pools drawn", ok: poolsDrawn },
    { label: "Captains ready", ok: captainsReady },
    { label: "Draft complete", ok: draftComplete },
    { label: "Score saved", ok: scoreSaved },
    { label: "Match finished", ok: matchFinished },
  ];
  return (
    <div className="rounded-[2rem] border border-lime-200/12 bg-lime-200/[0.045] p-5 shadow-xl shadow-black/24">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">
          Lobby Checklist
        </div>
        <div className="rounded-full border border-white/10 bg-black/18 px-3 py-1 text-xs font-black text-lime-100">
          {items.filter((item) => item.ok).length}/{items.length}
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-bold ${
              item.ok
                ? "border-lime-200/18 bg-lime-200/8 text-lime-50"
                : "border-white/8 bg-black/18 text-emerald-100/46"
            }`}
          >
            <span>{item.label}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.16em]">
              {item.ok ? "OK" : "Offen"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoinTossButton({
  teamALabel,
  teamBLabel,
  winner,
  tossing,
  disabled,
  onToss,
}: {
  teamALabel: string;
  teamBLabel: string;
  winner: "teamA" | "teamB";
  tossing: boolean;
  disabled: boolean;
  onToss: () => void;
}) {
  const winnerLabel = winner === "teamA" ? teamALabel : teamBLabel;
  const finalRotation = winner === "teamA" ? "rotateY(0deg)" : "rotateY(180deg)";
  return (
    <div className="rounded-2xl border border-amber-200/16 bg-amber-200/[0.055] p-3">
      <div className="flex items-center gap-3">
        <div className="relative grid size-14 shrink-0 place-items-center" style={{ perspective: "500px" }}>
          <div
            className={`relative size-12 rounded-full shadow-xl shadow-amber-300/20 ${
              tossing
                ? winner === "teamA"
                  ? "animate-[coin-flip-a_1400ms_cubic-bezier(0.2,0.8,0.2,1)]"
                  : "animate-[coin-flip-b_1400ms_cubic-bezier(0.2,0.8,0.2,1)]"
                : ""
            }`}
            style={{
              transform: tossing ? undefined : finalRotation,
              transformStyle: "preserve-3d",
            }}
          >
            <CoinFace label="A" />
            <CoinFace label="B" back />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/70">
            Coin Toss
          </div>
          <div className="mt-1 truncate text-sm font-black text-emerald-50">
            {tossing ? "Münze fliegt..." : `${winnerLabel} darf Side wählen`}
          </div>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled || tossing}
        onClick={onToss}
        className="mt-3 w-full rounded-xl border border-amber-200/24 bg-amber-200/12 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-50 transition hover:border-amber-200/42 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {tossing ? "Toss läuft..." : "Coin Toss starten"}
      </button>
      <style>{`
        @keyframes coin-flip-a {
          0% { transform: rotateY(0deg) translateY(0) scale(1); }
          20% { transform: rotateY(540deg) translateY(-16px) scale(1.08); }
          42% { transform: rotateY(1080deg) translateY(-6px) scale(1.04); }
          64% { transform: rotateY(1620deg) translateY(-12px) scale(1.06); }
          84% { transform: rotateY(2160deg) translateY(0) scale(1); }
          100% { transform: rotateY(2520deg) translateY(0) scale(1); }
        }
        @keyframes coin-flip-b {
          0% { transform: rotateY(0deg) translateY(0) scale(1); }
          20% { transform: rotateY(540deg) translateY(-16px) scale(1.08); }
          42% { transform: rotateY(1080deg) translateY(-6px) scale(1.04); }
          64% { transform: rotateY(1620deg) translateY(-12px) scale(1.06); }
          84% { transform: rotateY(2160deg) translateY(0) scale(1); }
          100% { transform: rotateY(2700deg) translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function CoinFace({ label, back }: { label: "A" | "B"; back?: boolean }) {
  return (
    <div
      className={`absolute inset-0 grid place-items-center rounded-full border text-sm font-black text-emerald-950 ${
        label === "A"
          ? "border-amber-100/40 bg-gradient-to-br from-amber-100 via-lime-200 to-emerald-300"
          : "border-sky-100/40 bg-gradient-to-br from-sky-100 via-cyan-200 to-lime-200"
      }`}
      style={{
        backfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : "rotateY(0deg)",
      }}
    >
      {label}
    </div>
  );
}

function ChampionPicker({
  title,
  champions,
  selected,
  onChange,
}: {
  title: string;
  champions: ChampionPool["champions"];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/58">
          {title}
        </div>
        <div className="text-xs font-black text-emerald-100/44">
          {selected.length} gewählt
        </div>
      </div>
      {champions.length === 0 ? (
        <p className="mt-3 text-sm italic text-emerald-100/42">
          Ziehe zuerst Pools, damit Champions auswählbar sind.
        </p>
      ) : (
        <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {champions.map((champion) => {
            const active = selectedSet.has(champion.name);
            return (
              <label
                key={champion.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                  active
                    ? "border-lime-200/34 bg-lime-200/12 text-lime-50"
                    : "border-white/8 bg-black/18 text-emerald-100/64 hover:border-lime-200/20"
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => {
                    onChange(
                      event.target.checked
                        ? [...selected, champion.name]
                        : selected.filter((name) => name !== champion.name),
                    );
                  }}
                  className="accent-lime-200"
                />
                <span className="truncate">{champion.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PoolBadge({ label, pool }: { label: string; pool: string }) {
  return (
    <div className="rounded-2xl border border-lime-200/14 bg-lime-200/8 p-3">
      <div className="truncate text-xs font-bold text-emerald-100/54">{label}</div>
      <div className="mt-1 text-3xl font-black text-lime-100">{compactPoolLabel(pool)}</div>
    </div>
  );
}

function EmergencySubPanel({
  match,
  roster,
  onMessage,
}: {
  match: ControlMatch;
  roster: RosterSnapshot;
  onMessage: (message: string) => void;
}) {
  const router = useRouter();
  const [teamKey, setTeamKey] = useState("");
  const [incomingDiscordId, setIncomingDiscordId] = useState("");
  const [outgoingDiscordId, setOutgoingDiscordId] = useState("");
  const [role, setRole] = useState("Sub");
  const [isPending, startTransition] = useTransition();
  const matchTeams = roster.teams.filter(
    (team) => team.name === match.teamAName || team.name === match.teamBName,
  );
  const selectedTeam = roster.teams.find((team) => team.key === teamKey) ?? matchTeams[0] ?? null;
  const incomingOptions = roster.applicants.filter(
    (applicant) => !selectedTeam?.players.some((player) => player.discordId === applicant.discordId),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetTeamKey = teamKey || selectedTeam?.key || "";
    if (!targetTeamKey || !incomingDiscordId) {
      onMessage("Bitte Team und Ersatzspieler auswählen.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/tournament/substitute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamKey: targetTeamKey,
          incomingDiscordId,
          outgoingDiscordId: outgoingDiscordId || undefined,
          role,
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onMessage(json?.message ?? "Substitute konnte nicht gespeichert werden.");
        return;
      }
      onMessage("Emergency Substitute gespeichert.");
      setIncomingDiscordId("");
      setOutgoingDiscordId("");
      router.refresh();
    });
  }

  if (matchTeams.length === 0) return null;

  return (
    <form
      onSubmit={submit}
      className="rounded-[2rem] border border-amber-200/16 bg-amber-200/[0.055] p-5 shadow-xl shadow-black/20"
    >
      <div className="text-xs font-black uppercase tracking-[0.24em] text-amber-100/72">
        Emergency Substitute
      </div>
      <p className="mt-2 text-xs leading-5 text-amber-50/62">
        Tauscht einen Spieler im aktiven Roster, ohne Match-Historie oder Scores anzufassen.
      </p>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/52">
            Team
          </span>
          <ThemedSelect
            name="subTeam"
            value={teamKey || selectedTeam?.key || ""}
            onChange={(value) => {
              setTeamKey(value);
              setOutgoingDiscordId("");
            }}
            options={matchTeams.map((team) => ({ value: team.key, label: team.name }))}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/52">
            Incoming
          </span>
          <ThemedSelect
            name="incoming"
            value={incomingDiscordId}
            onChange={setIncomingDiscordId}
            options={[
              { value: "", label: "Spieler wählen" },
              ...incomingOptions.map((applicant) => ({
                value: applicant.discordId,
                label: `${applicant.displayName} · ${applicant.riotId}`,
              })),
            ]}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/52">
            Optional raus
          </span>
          <ThemedSelect
            name="outgoing"
            value={outgoingDiscordId}
            onChange={setOutgoingDiscordId}
            options={[
              { value: "", label: "Niemanden entfernen" },
              ...(selectedTeam?.players ?? []).map((player) => ({
                value: player.discordId,
                label: `${player.role ?? "Fill"} · ${player.riotId}`,
              })),
            ]}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/52">
            Rolle
          </span>
          <ThemedSelect
            name="role"
            value={role}
            onChange={setRole}
            options={["Sub", "Top", "Jungle", "Mid", "Bot", "Support", "Fill"].map((value) => ({
              value,
              label: value,
            }))}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="mt-4 w-full rounded-2xl border border-amber-200/24 bg-amber-200/12 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-amber-50 transition hover:border-amber-200/42 disabled:opacity-50"
      >
        Substitute speichern
      </button>
    </form>
  );
}

function TeamPanel({
  side,
  team,
  pool,
  fallback,
}: {
  side: string;
  team: TournamentTeam | null;
  pool: string | null;
  fallback: string;
}) {
  const riotIds = teamRiotIds(team);
  return (
    <article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">
            {side}
          </div>
          <h2 className="mt-2 break-words text-3xl font-black text-emerald-50">
            {team?.name ?? fallback}
          </h2>
          {pool ? (
            <div className="mt-2 inline-flex rounded-full border border-lime-200/20 bg-lime-200/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-lime-50">
              Pool {compactPoolLabel(pool)}
            </div>
          ) : null}
        </div>
        {riotIds.length > 0 ? (
          <a
            href={opggMultiSearchUrl(riotIds)}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-100/72 hover:text-lime-100"
          >
            OP.GG
          </a>
        ) : null}
      </div>

      {team ? (
        <div className="mt-5 grid gap-2">
          {team.players.map((player) => (
            <div
              key={player.riotId}
              className="grid gap-2 rounded-2xl border border-white/8 bg-black/20 p-3 sm:grid-cols-[5.5rem_1fr_auto] sm:items-center"
            >
              <div className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/58">
                {player.role}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-emerald-50">{player.name}</div>
                <div className="truncate text-xs text-emerald-100/46">{player.riotId}</div>
              </div>
              <div className="flex gap-2">
                <a
                  href={player.opggUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100/64 hover:text-lime-100"
                >
                  OP.GG
                </a>
                <a
                  href={player.dpmUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100/64 hover:text-lime-100"
                >
                  DPM
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-amber-200/16 bg-amber-200/8 p-4 text-sm text-amber-50/76">
          Dieses Team ist noch nicht aufgelöst. Sobald Seeds/Bracket-Slots feststehen, erscheint hier das Roster.
        </p>
      )}
    </article>
  );
}
