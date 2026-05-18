"use client";

import Image from "next/image";
import { useState, type FormEvent, type ReactNode } from "react";
import { announcedDates, rankOptions } from "@/lib/tournament-data";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ThemedSelect } from "@/components/ThemedSelect";

type SubmitState =
  | { status: "idle"; message: "" }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const initialState: SubmitState = { status: "idle", message: "" };

type DiscordIdentity = { id: string; handle: string } | null;

type VerifiedAccount = {
  riotId: string;
  puuid: string;
  currentRankAuto: string | null;
  verifiedAt: string;
} | null;

type Challenge = {
  riotId: string;
  expectedIconId: number;
  expectedIconUrl: string;
  currentIconId: number;
  expiresAt: string;
};

export function ApplicationForm({
  discordIdentity,
  initialVerified,
}: {
  discordIdentity: DiscordIdentity;
  initialVerified: VerifiedAccount;
}) {
  const [verified, setVerified] = useState<VerifiedAccount>(initialVerified);
  const [state, setState] = useState<SubmitState>(initialState);
  const [lastSeasonRank, setLastSeasonRank] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!discordIdentity) {
      setState({ status: "error", message: "Bitte zuerst mit Discord anmelden." });
      return;
    }
    if (!verified) {
      setState({ status: "error", message: "Bitte zuerst deinen Riot-Account verifizieren." });
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ status: "loading", message: "Bewerbung wird abgeschickt..." });

    const payload = {
      displayName: String(formData.get("displayName") ?? ""),
      preferredRoles: formData.getAll("preferredRoles").map(String),
      lastSeasonRank: String(formData.get("lastSeasonRank") ?? ""),
      availableAllDates: formData.get("availableAllDates") === "on",
      notes: String(formData.get("notes") ?? ""),
      acceptedRules: formData.get("acceptedRules") === "on",
      acceptedDataStorage: formData.get("acceptedDataStorage") === "on",
    };

    const response = await fetch("/api/tournament/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setState({
        status: "error",
        message: result?.message ?? "Bewerbung konnte noch nicht abgeschickt werden.",
      });
      return;
    }

    setState({
      status: "success",
      message: result?.message ?? "Bewerbung gespeichert.",
    });
  }

  if (!discordIdentity) {
    return (
      <div className="rounded-2xl border border-amber-200/24 bg-amber-200/10 px-4 py-3 text-sm leading-6 text-amber-50">
        Bitte zuerst mit Discord anmelden, bevor du dich bewirbst. So weiß das
        Staff sicher, welcher Discord-Account zur Bewerbung gehört.
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <RiotVerifyPanel
        verified={verified}
        onVerified={(account) => setVerified(account)}
        onDisconnected={() => {
          setVerified(null);
          setState(initialState);
        }}
      />

      <form
        onSubmit={onSubmit}
        className={`grid gap-5 ${verified ? "" : "pointer-events-none opacity-50"}`}
      >
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">
            Angekündigte Turniertermine
          </span>
          <input
            value={announcedDates}
            readOnly
            className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none"
          />
        </label>

        <Consent name="availableAllDates">
          Ich kann an allen angekündigten Turnierterminen teilnehmen.
        </Consent>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Anzeigename" name="displayName" placeholder="Wie soll das Staff dich nennen?" />
          <ReadOnlyField label="Riot-ID (verifiziert)" value={verified?.riotId ?? "—"} />
          <ReadOnlyField label="Discord-Account" value={discordIdentity.handle} />
          <ReadOnlyField
            label="Aktueller Rang (von Riot)"
            value={verified?.currentRankAuto ?? "Unranked"}
          />
          <RankSelect
            label="Last-Season-Rang"
            name="lastSeasonRank"
            value={lastSeasonRank}
            onChange={setLastSeasonRank}
          />
        </div>

        <div>
          <label className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">
            Wunschrollen
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {["Top", "Jungle", "Mid", "Bot", "Support", "Fill"].map((role) => (
              <label
                key={role}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/16 px-4 py-3 text-sm font-bold text-emerald-100/76"
              >
                <input
                  type="checkbox"
                  name="preferredRoles"
                  value={role}
                  className="size-4 accent-lime-300"
                />
                {role}
              </label>
            ))}
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">
            Notizen
          </span>
          <textarea
            name="notes"
            rows={3}
            placeholder="Mitspieler, Shotcalling-Erfahrung, Stream-Einschränkungen usw."
            className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none transition placeholder:text-emerald-100/34 focus:border-lime-200/40"
          />
        </label>

        <div className="grid gap-3">
          <Consent name="acceptedRules">
            Ich habe die Regeln gelesen und verstehe, dass Admins toxische oder
            unvollständige Bewerbungen ablehnen dürfen.
          </Consent>
          <Consent name="acceptedDataStorage">
            Ich bin damit einverstanden, dass meine Turnierbewerbung zur
            Eventorganisation gespeichert wird.
          </Consent>
        </div>

        {state.message ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              state.status === "error"
                ? "border-red-300/30 bg-red-500/10 text-red-100"
                : "border-lime-200/24 bg-lime-200/10 text-lime-50"
            }`}
          >
            {state.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={state.status === "loading" || !verified}
          className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {state.status === "loading" ? "Wird abgeschickt..." : "Bewerbung absenden"}
        </button>
      </form>
    </div>
  );
}

function RiotVerifyPanel({
  verified,
  onVerified,
  onDisconnected,
}: {
  verified: VerifiedAccount;
  onVerified: (account: NonNullable<VerifiedAccount>) => void;
  onDisconnected: () => void;
}) {
  const [riotIdInput, setRiotIdInput] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  async function performDisconnect() {
    setConfirmOpen(false);
    setDisconnecting(true);
    setUnlinkError(null);
    const response = await fetch("/api/tournament/riot/disconnect", { method: "POST" });
    setDisconnecting(false);
    if (!response.ok) {
      setUnlinkError("Trennen fehlgeschlagen. Bitte erneut versuchen.");
      return;
    }
    onDisconnected();
  }

  if (verified) {
    return (
      <div className="rounded-2xl border border-lime-200/24 bg-lime-200/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-lime-100/68">
              Riot-Account verifiziert
            </div>
            <div className="mt-2 grid gap-1">
              <div className="text-lg font-black text-lime-50">{verified.riotId}</div>
              <div className="text-xs text-lime-100/70">
                Aktueller Rang (von Riot): {verified.currentRankAuto ?? "Unranked"}
              </div>
              <div className="text-xs text-lime-100/52">
                Verifiziert {new Date(verified.verifiedAt).toLocaleString("de-DE")}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={disconnecting}
            className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100/62 underline decoration-lime-200/30 underline-offset-4 hover:text-lime-100 disabled:opacity-50"
          >
            {disconnecting ? "Trennen..." : "Falscher Account? Trennen"}
          </button>
        </div>
        {unlinkError ? (
          <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-xs text-red-100">
            {unlinkError}
          </div>
        ) : null}
        <ConfirmDialog
          open={confirmOpen}
          title="Riot-Account wirklich trennen?"
          description={
            <>
              Jede für diesen Discord-Account eingereichte Bewerbung wird
              ebenfalls entfernt. Du kannst dich direkt danach mit einer
              anderen Riot-ID neu verifizieren.
            </>
          }
          confirmLabel="Ja, trennen"
          cancelLabel="Verbunden lassen"
          tone="danger"
          onConfirm={performDisconnect}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    );
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!riotIdInput.trim()) return;
    setStatus({ kind: "loading", message: "Riot-Account wird gesucht..." });
    const response = await fetch("/api/tournament/riot/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ riotId: riotIdInput.trim() }),
    });
    const result = (await response.json().catch(() => null)) as
      | (Challenge & { message?: string })
      | { message?: string }
      | null;
    if (!response.ok || !result || !("expectedIconId" in result)) {
      setStatus({
        kind: "error",
        message: result?.message ?? "Verifizierung konnte nicht gestartet werden.",
      });
      return;
    }
    setChallenge(result);
    setStatus({ kind: "idle" });
  }

  async function verify() {
    // Riot's summoner-v4 cache can lag behind a client relog by 30–90s, so
    // instead of failing on the first mismatch we poll up to ~90s before
    // giving up. Visible loading text updates so the user knows we're working.
    const MAX_ATTEMPTS = 7;
    const DELAY_MS = 8000;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const label =
        attempt === 1
          ? "Icon wird geprüft..."
          : `Riot hat es noch nicht übernommen. Neuer Versuch... (${attempt}/${MAX_ATTEMPTS})`;
      setStatus({ kind: "loading", message: label });

      const response = await fetch("/api/tournament/riot/verify", { method: "POST" });
      const result = (await response.json().catch(() => null)) as
        | {
            verified?: {
              riotId: string;
              puuid: string;
              currentRankAuto: string | null;
              verifiedAt: string;
            };
            message?: string;
          }
        | null;

      if (response.ok && result?.verified) {
        onVerified(result.verified);
        setChallenge(null);
        setStatus({ kind: "idle" });
        return;
      }

      // Only retry on 409 (icon mismatch) — other failures stop immediately.
      if (response.status !== 409 || attempt === MAX_ATTEMPTS) {
        setStatus({
          kind: "error",
          message:
            result?.message ??
            "Verifizierung fehlgeschlagen. Melde dich im League-Client ab und wieder an, dann erneut klicken.",
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200/24 bg-amber-200/[0.06] p-5">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-100/72">
        Schritt 1 · Riot-Account verifizieren
      </div>
      <p className="mt-2 text-sm leading-6 text-emerald-100/72">
        Beweise den Besitz deiner Riot-ID, indem du kurz dein League-Profilicon
        wechselst. Direkt danach kannst du es wieder zurückstellen.
      </p>

      {!challenge ? (
        <form onSubmit={start} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={riotIdInput}
            onChange={(event) => setRiotIdInput(event.target.value)}
            required
            placeholder="Name#TAG"
            className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/34"
          />
          <button
            type="submit"
            disabled={status.kind === "loading"}
            className="rounded-2xl bg-amber-200 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-amber-950 disabled:opacity-60"
          >
            {status.kind === "loading" ? "Wird gesucht..." : "Verifizierung starten"}
          </button>
        </form>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <div className="flex flex-col items-center gap-1">
            <Image
              src={challenge.expectedIconUrl}
              alt={`Profilicon ${challenge.expectedIconId}`}
              width={88}
              height={88}
              unoptimized
              className="size-22 rounded-2xl border border-amber-200/24"
            />
            <span className="text-xs font-black text-amber-100/72">
              Icon ID {challenge.expectedIconId}
            </span>
          </div>
          <div className="grid gap-1 text-sm leading-6 text-emerald-100/76">
            <div>
              Öffne im League-Client dein Profil und setze das gezeigte Icon.
            </div>
            <div className="text-xs text-amber-100/70">
              <strong className="font-black">Dann im League-Client ab- und wieder anmelden</strong>
              {" "}— Riots öffentliche API übernimmt Icon-Änderungen erst, wenn deine Client-Session aktualisiert wird.
            </div>
            <div className="text-xs text-amber-100/52">
              Läuft ab um {new Date(challenge.expiresAt).toLocaleTimeString("de-DE")}.
            </div>
          </div>
          <button
            type="button"
            onClick={verify}
            disabled={status.kind === "loading"}
            className="rounded-2xl bg-lime-200 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-60"
          >
            {status.kind === "loading" ? "Prüfe..." : "Hab's gewechselt"}
          </button>
        </div>
      )}

      {status.kind === "error" ? (
        <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-xs text-red-100">
          {status.message}
        </div>
      ) : null}
    </div>
  );
}

function RankSelect({
  label,
  value,
  onChange,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name: string;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">
        {label}
      </span>
      <ThemedSelect
        name={name}
        value={value}
        onChange={onChange}
        placeholder="Rang wählen"
        required
        options={rankOptions.map((rank) => ({ value: rank, label: rank }))}
      />
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">
        {label}
      </span>
      <input
        name={name}
        required
        placeholder={placeholder}
        className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none transition placeholder:text-emerald-100/34 focus:border-lime-200/40"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">
        {label}
      </span>
      <input
        value={value}
        readOnly
        className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none"
      />
    </label>
  );
}

function Consent({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="flex gap-3 rounded-2xl border border-white/10 bg-black/16 p-4 text-sm leading-6 text-emerald-100/72">
      <input required type="checkbox" name={name} className="mt-1 size-4 shrink-0 accent-lime-300" />
      <span>{children}</span>
    </label>
  );
}
