"use client";

import { useCallback, useEffect, useState } from "react";
import type { MyPayout, MyState } from "@/lib/winchallenge/me";
import type { WinPayoutStatus } from "@/lib/winchallenge/types";
import { winFetch } from "../win-api";

type MeResponse = ({ loggedIn: false } | ({ loggedIn: true } & MyState)) & { message?: string };

const STATUS: Record<WinPayoutStatus, string> = { open: "offen", paid: "verschenkt", confirmed: "bestätigt" };

export function EinsatzClient() {
	const [me, setMe] = useState<MeResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
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
	}, [load]);

	const mark = useCallback(
		async (id: string, action: "paid" | "confirm") => {
			setBusy(id);
			setError(null);
			try {
				await winFetch("/api/winchallenge/payout", { body: { id, action } });
				await load();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Speichern fehlgeschlagen.");
			} finally {
				setBusy(null);
			}
		},
		[load],
	);

	if (!me) return <p className="text-sm text-[var(--muted)]">{error ?? "Lade…"}</p>;
	if (!me.loggedIn) return null;
	if (!me.challenge || !me.participant) return <Box>Du bist bei der aktuellen Win Challenge nicht angemeldet.</Box>;
	if (me.challenge.status === "open") return <Box>Die Challenge läuft noch. Sobald sie beendet ist, steht hier, an wen dein Sub geht.</Box>;

	const { give, receive } = me.payouts;
	return (
		<div className="grid gap-4">
			<div aria-live="polite">{error ? <p className="rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}</div>

			<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
				<h2 className="font-display text-lg font-semibold text-[var(--text)]">Du schenkst</h2>
				{give.length === 0 ? (
					<p className="mt-3 text-sm text-[var(--muted)]">Du schuldest keinen Sub. Entweder hat dein Team nicht gestartet, oder es gibt niemanden außerhalb deines Teams, der etwas bekommt.</p>
				) : (
					give.map((payout) => <GiveRow key={payout.id} payout={payout} busy={busy === payout.id} onPaid={() => mark(payout.id, "paid")} />)
				)}
			</section>

			{receive.length ? (
				<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
					<h2 className="font-display text-lg font-semibold text-[var(--text)]">Du bekommst {receive.length === 1 ? "1 Sub" : `${receive.length} Subs`}</h2>
					<p className="mt-1 text-sm text-[var(--muted)]">Bestätige jeden Sub, sobald er angekommen ist.</p>
					<ul className="mt-4 grid gap-2">
						{receive.map((payout) => (
							<li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
								<span className="text-sm">
									<span className="font-semibold text-[var(--text)]">{payout.otherName}</span>
									<span className="block text-xs text-[var(--muted)]">
										auf Kanal {payout.channel} · {STATUS[payout.status]}
									</span>
								</span>
								{payout.status === "confirmed" ? (
									<span className="text-sm font-semibold text-[var(--accent)]">Erhalten ✓</span>
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

function GiveRow({ payout, busy, onPaid }: { payout: MyPayout; busy: boolean; onPaid: () => void }) {
	return (
		<div className="mt-4 grid gap-4">
			<p className="text-base leading-7 text-[var(--text)]">
				1 Sub an <span className="font-semibold">{payout.otherName}</span>
				{payout.otherTwitch ? <span className="text-[var(--muted)]"> (twitch.tv/{payout.otherTwitch})</span> : null} auf dem Kanal{" "}
				<span className="font-semibold">{payout.channel}</span>
			</p>
			<p className="text-sm text-[var(--muted)]">
				Öffne den Kanal, wähle „Sub verschenken“ und gib als Empfänger <span className="font-mono text-[var(--text)]">{payout.otherTwitch || payout.otherName}</span> ein. Platz {payout.place}.
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
