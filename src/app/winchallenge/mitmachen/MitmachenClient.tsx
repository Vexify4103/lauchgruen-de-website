"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ThemedSelect } from "@/components/ThemedSelect";
import type { MyState } from "@/lib/winchallenge/me";
import { formatDateTime, winFetch } from "../win-api";

type MeResponse = ({ loggedIn: false } | ({ loggedIn: true; isOwner: boolean } & MyState)) & { message?: string };

const TWITCH_NOTICE: Record<string, string> = {
	connected: "Twitch ist verknüpft.",
	cancelled: "Twitch-Verknüpfung abgebrochen.",
	failed: "Twitch-Verknüpfung fehlgeschlagen. Bitte nochmal versuchen.",
	"invalid-state": "Die Verknüpfung ist abgelaufen. Bitte nochmal versuchen.",
	configuration: "Twitch-Verknüpfung ist gerade nicht verfügbar.",
};

const input = "w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

function Step({ number, title, done, children }: { number: number; title: string; done?: boolean; children: ReactNode }) {
	return (
		<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
			<h2 className="flex items-center gap-3 font-display text-lg font-semibold text-[var(--text)]">
				<span
					className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? "bg-[var(--accent)] text-[var(--on-accent)]" : "border border-[var(--line-strong)] text-[var(--muted)]"}`}
					aria-hidden="true"
				>
					{done ? "✓" : number}
				</span>
				{title}
			</h2>
			<div className="mt-4 text-sm leading-6 text-[var(--muted)]">{children}</div>
		</section>
	);
}

export function MitmachenClient({ twitchStatus }: { twitchStatus: string | null }) {
	const [me, setMe] = useState<MeResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(twitchStatus ? (TWITCH_NOTICE[twitchStatus] ?? null) : null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			setMe(await winFetch<MeResponse>("/api/winchallenge/me"));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Laden fehlgeschlagen.");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const act = useCallback(
		async (url: string, body: unknown, success: string | null, method?: string) => {
			setBusy(true);
			setError(null);
			setNotice(null);
			try {
				await winFetch(url, { body, method });
				if (success) setNotice(success);
				await load();
				return true;
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
				return false;
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	if (!me) return <p className="text-sm text-[var(--muted)]">{error ?? "Lade…"}</p>;
	if (!me.loggedIn) return null;
	if (!me.challenge) {
		return (
			<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6 text-sm text-[var(--muted)]">
				Aktuell läuft keine Win Challenge. Sobald die nächste angekündigt ist, kannst du dich hier anmelden.
			</section>
		);
	}

	const challenge = me.challenge;
	const signedUp = Boolean(me.participant);
	const closed = challenge.status !== "open";

	return (
		<div className="grid gap-4">
			<p className="text-sm text-[var(--muted)]">
				<span className="font-semibold text-[var(--text)]">{challenge.name}</span> · Start {formatDateTime(challenge.startAt)} · {challenge.games.length} Spiele
			</p>
			<div aria-live="polite" className="grid gap-2">
				{error ? <p className="rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
				{notice ? <p className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--accent)]">{notice}</p> : null}
			</div>

			<Step number={1} title="Twitch verknüpfen" done={Boolean(me.twitch)}>
				{me.twitch ? (
					<div className="flex items-center gap-3">
						{me.twitch.profileImageUrl ? (
							<Image src={me.twitch.profileImageUrl} alt="" width={40} height={40} unoptimized className="size-10 shrink-0 rounded-full border border-[var(--line)] object-cover" />
						) : null}
						<p>
							Verknüpft mit <span className="font-semibold text-[var(--text)]">twitch.tv/{me.twitch.login}</span>. Darüber prüfen wir, ob einer von euch live ist.
						</p>
					</div>
				) : (
					<>
						<p>Während der Timer läuft, muss einer von euch beiden auf Twitch live sein. Dafür brauchen wir deinen Twitch-Namen.</p>
						<a href="/api/twitch/connect?from=winchallenge" className="button mt-4" style={{ background: "#9146ff", color: "#fff" }}>
							Twitch verknüpfen
						</a>
					</>
				)}
			</Step>

			<Step number={2} title="Anmelden" done={signedUp}>
				{signedUp ? (
					<p>Du bist dabei.</p>
				) : (
					<SignUpForm disabled={busy || !me.twitch || closed || !challenge.signupOpen} reason={!me.twitch ? "Verknüpfe zuerst Twitch." : !challenge.signupOpen || closed ? "Die Anmeldung ist gerade geschlossen." : null} onSubmit={() => act("/api/winchallenge/signup", { acceptRules: true }, "Du bist angemeldet.")} />
				)}
			</Step>

			{signedUp ? (
				<Step number={3} title="Team bilden" done={Boolean(me.team && me.team.members.length === 2)}>
					{me.team ? <TeamBox me={me} busy={busy} closed={closed} act={act} /> : <TeamForms busy={busy || closed} act={act} />}
				</Step>
			) : null}

			{signedUp && me.participant ? <SubTarget me={me} busy={busy} act={act} /> : null}
		</div>
	);
}

function SignUpForm({ disabled, reason, onSubmit }: { disabled: boolean; reason: string | null; onSubmit: () => void }) {
	const [accepted, setAccepted] = useState(false);
	return (
		<>
			<ul className="grid list-disc gap-1.5 pl-5">
				<li>Ihr spielt zu zweit eine feste Liste an Spielen durch, in beliebiger Reihenfolge. Wer zuerst alles geschafft hat, gewinnt.</li>
				<li>Die Uhr läuft für alle ab dem offiziellen Start, auch in Pausen. Pause zeigt nur auf Stream und Rangliste, dass ihr gerade nicht spielt.</li>
				<li>Start, Weiter, Erledigt und Fortschritt gehen nur, wenn einer von euch auf Twitch live ist.</li>
				<li>Einsatz: jeder schenkt nach dem Ende 1 Twitch-Sub an ein Team aus den Top 3. Die Seite sagt dir, an wen.</li>
				<li>Fair Play unter Freunden. Die Orga kann Zeiten korrigieren und Teams entfernen.</li>
			</ul>
			<label className="mt-4 flex items-start gap-2 text-[var(--text)]">
				<input type="checkbox" className="mt-1.5" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
				Ich habe die Regeln gelesen und zahle meinen Einsatz (1 Sub).
			</label>
			<button type="button" className="button primary mt-4" disabled={disabled || !accepted} onClick={onSubmit}>
				Mitmachen
			</button>
			{reason ? <p className="mt-2 text-xs">{reason}</p> : null}
		</>
	);
}

type Act = (url: string, body: unknown, success: string | null, method?: string) => Promise<boolean>;

function TeamForms({ busy, act }: { busy: boolean; act: Act }) {
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	function create(event: FormEvent) {
		event.preventDefault();
		void act("/api/winchallenge/team", { action: "create", name }, "Team erstellt. Gib deinem Partner den Code.");
	}
	function join(event: FormEvent) {
		event.preventDefault();
		void act("/api/winchallenge/team", { action: "join", code }, "Du bist dem Team beigetreten.");
	}
	return (
		<div className="grid gap-5 sm:grid-cols-2">
			<form onSubmit={create} className="grid content-start gap-2">
				<label htmlFor="wc-team-name" className="font-semibold text-[var(--text)]">
					Team erstellen
				</label>
				<input id="wc-team-name" className={input} value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={40} placeholder="Teamname" autoComplete="off" />
				<button type="submit" className="button primary justify-self-start" disabled={busy || name.trim().length < 2}>
					Erstellen
				</button>
			</form>
			<form onSubmit={join} className="grid content-start gap-2">
				<label htmlFor="wc-join-code" className="font-semibold text-[var(--text)]">
					Team beitreten
				</label>
				<input
					id="wc-join-code"
					className={`${input} font-mono uppercase tracking-[0.2em]`}
					value={code}
					onChange={(event) => setCode(event.target.value)}
					maxLength={12}
					placeholder="Code"
					autoComplete="off"
					spellCheck={false}
				/>
				<button type="submit" className="button ghost justify-self-start" disabled={busy || code.trim().length < 4}>
					Beitreten
				</button>
			</form>
		</div>
	);
}

function TeamBox({ me, busy, closed, act }: { me: Extract<MeResponse, { loggedIn: true }>; busy: boolean; closed: boolean; act: Act }) {
	const team = me.team!;
	const [copied, setCopied] = useState(false);
	const started = team.status !== "forming" && team.status !== "ready";
	async function copy() {
		await navigator.clipboard.writeText(team.joinCode).catch(() => undefined);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	}
	return (
		<div className="grid gap-4">
			<p>
				Team <span className="font-semibold text-[var(--text)]">{team.name}</span>: {team.members.map((member) => member.name).join(" + ")}
				{team.members.length < 2 ? " (wartet auf Partner)" : ""}
			</p>
			{!started ? (
				<div className="flex flex-wrap items-center gap-3">
					<span className="text-xs">Beitrittscode</span>
					<span className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 font-mono text-lg tracking-[0.25em] text-[var(--text)]">{team.joinCode}</span>
					<button type="button" className="button small ghost" onClick={() => void copy()}>
						{copied ? "Kopiert" : "Kopieren"}
					</button>
					<button type="button" className="button small ghost" disabled={busy || closed} onClick={() => void act("/api/winchallenge/team", { action: "new-code" }, "Neuer Code erstellt. Der alte gilt nicht mehr.")}>
						Neuer Code
					</button>
				</div>
			) : null}
			<div className="flex flex-wrap gap-3">
				{team.members.length === 2 ? (
					<Link href="/winchallenge/control" className="button primary">
						Zur Steuerung
					</Link>
				) : null}
				<Link href={`/winchallenge/team/${team.slug}`} className="button ghost">
					Teamseite
				</Link>
				{!started ? (
					<button
						type="button"
						className="button ghost"
						disabled={busy || closed}
						onClick={() => {
							if (window.confirm("Team wirklich verlassen?")) void act("/api/winchallenge/team", { action: "leave" }, "Du hast das Team verlassen.");
						}}
					>
						Team verlassen
					</button>
				) : (
					<p className="self-center text-xs">Euer Timer wurde gestartet. Teamänderungen nur noch über die Orga.</p>
				)}
			</div>
		</div>
	);
}

function SubTarget({ me, busy, act }: { me: MyState; busy: boolean; act: Act }) {
	const current = me.participant?.subTarget ?? "self";
	const own = me.participant?.twitchLogin ?? "";
	const partner = me.team?.members.find((member) => member.id !== me.participant?.id);
	function change(value: string) {
		if (value !== "self" && value !== "partner") return;
		void act("/api/winchallenge/me", { subTarget: value }, "Gespeichert.", "PATCH");
	}
	return (
		<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
			<h2 className="font-display text-lg font-semibold text-[var(--text)]">Subs bei Gewinn</h2>
			<p className="mt-2 text-sm leading-6 text-[var(--muted)]">Falls ihr in die Top 3 kommt: auf wessen Kanal sollen deine geschenkten Subs gehen?</p>
			<div className="mt-4 max-w-sm">
				<ThemedSelect
					value={current}
					disabled={busy}
					onChange={change}
					ariaLabel="Empfänger der Subs"
					options={[
						{ value: "self", label: "Mein Kanal", description: own ? `twitch.tv/${own}` : undefined },
						{
							value: "partner",
							label: partner ? `Kanal von ${partner.name}` : "Kanal meines Partners",
							description: partner ? `twitch.tv/${partner.twitch}` : "Noch kein Partner im Team",
							disabled: !partner,
						},
					]}
				/>
			</div>
		</section>
	);
}
