"use client";

import { useCallback, useEffect, useState } from "react";
import type { MyPayout, MyState } from "@/lib/winchallenge/me";
import type { WinPayoutStatus } from "@/lib/winchallenge/types";
import { formatDateTime, winFetch } from "../win-api";

type MeResponse = ({ loggedIn: false } | ({ loggedIn: true } & MyState)) & { message?: string };

const STATUS: Record<WinPayoutStatus, string> = { open: "offen", paid: "verschenkt", confirmed: "bestätigt" };

const TWITCH_NOTICE: Record<string, { text: string; error?: boolean }> = {
	"subs-connected": { text: "Kanal verbunden. Verschenkte Subs werden ab jetzt automatisch erkannt." },
	"subs-mismatch": { text: "Das war nicht der Twitch-Kanal, der mit deinem Konto verknüpft ist. Melde dich bei Twitch mit diesem Kanal an.", error: true },
	cancelled: { text: "Verbindung abgebrochen.", error: true },
	failed: { text: "Verbindung mit Twitch fehlgeschlagen. Versuch es nochmal.", error: true },
	configuration: { text: "Twitch ist gerade nicht eingerichtet. Sag der Orga Bescheid.", error: true },
};

export function EinsatzClient() {
	const [me, setMe] = useState<MeResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setMe(await winFetch<MeResponse>("/api/winchallenge/me"));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Laden fehlgeschlagen.");
		}
	}, []);

	useEffect(() => {
		void load();
		const url = new URL(window.location.href);
		const status = url.searchParams.get("twitch");
		if (status && TWITCH_NOTICE[status]) setNotice(TWITCH_NOTICE[status]);
		if (status) {
			url.searchParams.delete("twitch");
			url.searchParams.delete("from");
			window.history.replaceState(null, "", url.pathname + url.search);
		}
	}, [load]);

	const mark = useCallback(
		async (id: string, action: "paid" | "confirm") => {
			setBusy(id);
			setError(null);
			try {
				const result = await winFetch<{ status: WinPayoutStatus }>("/api/winchallenge/payout", { body: { id, action } });
				if (action === "paid") {
					setNotice(
						result.status === "confirmed"
							? { text: "Twitch hat deinen Sub gefunden. Bestätigt." }
							: { text: "Als verschenkt markiert. Der Empfänger oder die Twitch-Prüfung bestätigt ihn." }
					);
				}
				await load();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Speichern fehlgeschlagen.");
			} finally {
				setBusy(null);
			}
		},
		[load]
	);

	const check = useCallback(async () => {
		setBusy("check");
		setError(null);
		try {
			const result = await winFetch<{ confirmed: number }>("/api/winchallenge/subcheck", { body: {} });
			setNotice({ text: result.confirmed ? `${result.confirmed} ${result.confirmed === 1 ? "Sub" : "Subs"} gefunden und bestätigt.` : "Keine neuen Subs gefunden." });
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Prüfung fehlgeschlagen.");
		} finally {
			setBusy(null);
		}
	}, [load]);

	if (!me) return <p className="text-sm text-[var(--muted)]">{error ?? "Lade…"}</p>;
	if (!me.loggedIn) return null;
	if (!me.challenge || !me.participant) return <Box>Du bist bei der aktuellen Win Challenge nicht angemeldet.</Box>;
	if (me.challenge.status === "open") return <Box>Die Challenge läuft noch. Sobald sie beendet ist, steht hier, an wen dein Sub geht.</Box>;

	const { give, receive } = me.payouts;
	const payerLogin = me.twitch?.login ?? me.participant.twitchLogin;
	return (
		<div className="grid gap-4">
			<div aria-live="polite" className="grid gap-2">
				{error ? <p className="rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
				{notice ? (
					<p
						className={`rounded-lg border px-3 py-2 text-sm ${notice.error ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--line)] text-[var(--text)]"}`}
					>
						{notice.text}
					</p>
				) : null}
			</div>

			<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
				<h2 className="font-display text-lg font-semibold text-[var(--text)]">Du schenkst</h2>
				{give.length === 0 ? (
					<p className="mt-3 text-sm text-[var(--muted)]">
						Du schuldest keinen Sub. Entweder warst du ohne Partner, oder es gibt niemanden außerhalb deines Teams, der etwas bekommt.
					</p>
				) : (
					<>
						{give.map((payout) => (
							<GiveRow key={payout.id} payout={payout} busy={busy === payout.id} onPaid={() => mark(payout.id, "paid")} />
						))}
						<ul className="mt-5 grid list-disc gap-1 pl-5 text-sm text-[var(--muted)]">
							<li>
								Verschenke mit deinem verknüpften Twitch-Konto <span className="font-mono text-[var(--text)]">{payerLogin}</span>, sonst erkennt die Seite den Sub
								nicht.
							</li>
							<li>Nicht anonym verschenken. Anonyme Gifts kann niemand dir zuordnen.</li>
							<li>Wer seinen Sub nicht verschenkt, steht öffentlich in der Rangliste und ist bei der nächsten Win Challenge gesperrt.</li>
						</ul>
					</>
				)}
			</section>

			{me.subChannel ? <SubChannelBox channel={me.subChannel} busy={busy === "check"} onCheck={check} /> : null}

			{receive.length ? (
				<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
					<h2 className="font-display text-lg font-semibold text-[var(--text)]">Du bekommst {receive.length === 1 ? "1 Sub" : `${receive.length} Subs`}</h2>
					<p className="mt-1 text-sm text-[var(--muted)]">
						{receive.every((payout) => payout.channelConnected)
							? "Die Seite prüft die Subs selbst über Twitch. Manuell bestätigen musst du nur anonyme Gifts."
							: "Bestätige jeden Sub, sobald er angekommen ist. Verbundene Kanäle prüft die Seite selbst."}
					</p>
					<ul className="mt-4 grid gap-2">
						{receive.map((payout) => (
							<li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
								<span className="text-sm">
									<span className="font-semibold text-[var(--text)]">{payout.otherName}</span>
									<span className="block text-xs text-[var(--muted)]">
										auf Kanal {payout.channel} · {STATUS[payout.status]}
										{payout.confirmedBy === "Twitch"
											? " (per Twitch geprüft)"
											: payout.status !== "confirmed" && payout.channelConnected
												? " · wird automatisch geprüft"
												: ""}
									</span>
								</span>
								{payout.status === "confirmed" ? (
									<span className="text-sm font-semibold text-[var(--accent)]">Erhalten ✓</span>
								) : payout.channelConnected ? (
									<button
										type="button"
										className="text-xs text-[var(--muted)] underline underline-offset-2 hover:text-[var(--text)] disabled:opacity-50"
										disabled={busy === payout.id}
										onClick={() => {
											if (window.confirm(`Sub von ${payout.otherName} manuell bestätigen? Nur nötig, wenn er anonym verschenkt wurde.`))
												void mark(payout.id, "confirm");
										}}
									>
										Manuell bestätigen
									</button>
								) : (
									<button type="button" className="button small primary" disabled={busy === payout.id} onClick={() => void mark(payout.id, "confirm")}>
										Erhalten
									</button>
								)}
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}

function Box({ children }: { children: React.ReactNode }) {
	return <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6 text-sm text-[var(--muted)]">{children}</section>;
}

function SubChannelBox({ channel, busy, onCheck }: { channel: NonNullable<MyState["subChannel"]>; busy: boolean; onCheck: () => void }) {
	const info = channel.connected;
	return (
		<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
			<h2 className="font-display text-lg font-semibold text-[var(--text)]">Automatische Prüfung</h2>
			{info ? (
				<>
					<p className="mt-1 text-sm text-[var(--muted)]">
						Kanal <span className="text-[var(--text)]">{channel.login}</span> ist verbunden. Die Seite bestätigt verschenkte Subs auf deinem Kanal selbst.
						{info.lastCheckAt ? ` Zuletzt geprüft ${formatDateTime(info.lastCheckAt)}.` : ""}
					</p>
					{info.lastError ? <p className="mt-2 text-sm text-[var(--danger)]">{info.lastError}</p> : null}
					<div className="mt-4 flex flex-wrap gap-3">
						<button type="button" className="button small primary" disabled={busy} onClick={onCheck}>
							{busy ? "Prüfe…" : "Jetzt prüfen"}
						</button>
						{info.lastError ? (
							<a href="/api/twitch/connect?purpose=subs" className="button small ghost">
								Neu verbinden
							</a>
						) : null}
					</div>
				</>
			) : (
				<>
					<p className="mt-1 text-sm text-[var(--muted)]">
						Auf deinem Kanal <span className="text-[var(--text)]">{channel.login}</span> werden Subs verschenkt. Verbinde ihn einmal mit Twitch, dann erkennt die Seite
						die Subs selbst und bestätigt sie. Die Seite liest dafür nur deine Abonnentenliste.
					</p>
					<a href="/api/twitch/connect?purpose=subs" className="button small mt-4" style={{ background: "#9146ff", color: "#fff" }}>
						Kanal mit Twitch verbinden
					</a>
				</>
			)}
		</section>
	);
}

function GiveRow({ payout, busy, onPaid }: { payout: MyPayout; busy: boolean; onPaid: () => void }) {
	// Twitch does not let a streamer receive a sub on their own channel: then any viewer gets the gift.
	const ownChannel = payout.channel.toLowerCase() === payout.otherTwitch.toLowerCase();
	return (
		<div className="mt-4 grid gap-4">
			<p className="text-base leading-7 text-[var(--text)]">
				1 Sub für <span className="font-semibold">{payout.otherName}</span> auf dem Kanal <span className="font-semibold">{payout.channel}</span>
			</p>
			<p className="text-sm text-[var(--muted)]">
				{ownChannel ? (
					<>
						Öffne den Kanal, wähle „Sub verschenken“ und verschenke 1 Sub an die Community oder an einen beliebigen Zuschauer. Der Streamer selbst kann auf seinem
						eigenen Kanal keinen Sub bekommen. Platz {payout.place}.
					</>
				) : (
					<>
						Öffne den Kanal, wähle „Sub verschenken“ und gib als Empfänger{" "}
						<span className="font-mono text-[var(--text)]">{payout.otherTwitch || payout.otherName}</span> ein. Platz {payout.place}.
					</>
				)}
			</p>
			<div className="flex flex-wrap items-center gap-3">
				<a href={`https://www.twitch.tv/${payout.channel}`} target="_blank" rel="noreferrer" className="button" style={{ background: "#9146ff", color: "#fff" }}>
					Kanal öffnen
				</a>
				{payout.status === "open" ? (
					<button type="button" className="button primary" disabled={busy} onClick={onPaid}>
						Erledigt
					</button>
				) : (
					<span className="text-sm font-semibold text-[var(--accent)]">{STATUS[payout.status]} ✓</span>
				)}
			</div>
		</div>
	);
}
