"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { UltimateBraveryTestSlot } from "@/lib/ultimate-bravery-test";
import { TournamentLink as Link } from "../../TournamentLink";

type LobbyPayload = {
	slots: UltimateBraveryTestSlot[];
	currentSlotId: string | null;
	claimedCount: number;
	ready: boolean;
	isAdmin: boolean;
	message?: string;
};

function fingerprint(slots: UltimateBraveryTestSlot[]) {
	return slots.map((slot) => `${slot.slotId}:${slot.discordId ?? "-"}`).join("|");
}

export function UltimateBraveryTestLobby({ initial }: { initial: LobbyPayload }) {
	const router = useRouter();
	const [lobby, setLobby] = useState(initial);
	const [message, setMessage] = useState("");
	const [resetOpen, setResetOpen] = useState(false);
	const [soloOpen, setSoloOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const fingerprintRef = useRef(fingerprint(initial.slots));

	useEffect(() => {
		const timer = window.setInterval(async () => {
			const response = await fetch("/api/tournament/ultimate-bravery/test-lobby", { cache: "no-store" });
			if (!response.ok) return;
			const next = (await response.json()) as LobbyPayload;
			const nextFingerprint = fingerprint(next.slots);
			setLobby(next);
			if (nextFingerprint !== fingerprintRef.current) {
				fingerprintRef.current = nextFingerprint;
				router.refresh();
			}
		}, 4_000);
		return () => window.clearInterval(timer);
	}, [router]);

	function act(action: "claim" | "leave" | "release" | "reset" | "solo", slotId?: string) {
		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/ultimate-bravery/test-lobby", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action, ...(slotId ? { slotId } : {}) }),
			});
			const result = (await response.json().catch(() => null)) as LobbyPayload | { message?: string } | null;
			if (!response.ok || !result || !("slots" in result)) {
				setMessage(result?.message ?? "Testlobby konnte nicht aktualisiert werden.");
				return;
			}
			setLobby(result);
			fingerprintRef.current = fingerprint(result.slots);
			setMessage(result.message ?? "Testlobby aktualisiert.");
			setResetOpen(false);
			setSoloOpen(false);
			router.refresh();
		});
	}

	const teams = [...new Set(lobby.slots.map((slot) => slot.teamName))];
	return (
		<section className="mt-6 overflow-hidden rounded-[2rem] border border-cyan-200/16 bg-[#07160f]/92 shadow-xl shadow-black/25">
			<header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 bg-gradient-to-r from-cyan-300/[0.08] via-transparent to-lime-200/[0.06] p-5">
				<div>
					<div className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-100/58">Echter 5v5-Proberaum</div>
					<h2 className="mt-1 text-2xl font-black text-emerald-50">Zehn Discord-Accounts, zehn getrennte Rolls.</h2>
					<p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-100/48">
						Jeder Tester belegt genau eine Rolle. Erst bei 10/10 startet der Draft; danach kann jeder Account ausschließlich den eigenen Champion bedienen.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span
						className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${lobby.ready ? "border-lime-200/28 bg-lime-200/12 text-lime-100" : "border-amber-200/24 bg-amber-200/9 text-amber-100"}`}
					>
						{lobby.claimedCount}/10 belegt
					</span>
					{lobby.currentSlotId ? (
						<button
							type="button"
							disabled={isPending}
							onClick={() => act("leave")}
							className="rounded-xl border border-white/12 bg-black/18 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/66 disabled:opacity-40"
						>
							Eigenen Platz freigeben
						</button>
					) : null}
					{lobby.isAdmin ? (
						<>
							<button
								type="button"
								disabled={isPending}
								onClick={() => setSoloOpen(true)}
								className="rounded-xl bg-gradient-to-r from-amber-200 to-lime-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-950 disabled:opacity-40"
							>
								Allein testen
							</button>
							<Link
								href="/tournament/admin/matches/ub-test"
								className="rounded-xl bg-cyan-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-950"
							>
								Admin-Cockpit
							</Link>
							<button
								type="button"
								disabled={isPending}
								onClick={() => setResetOpen(true)}
								className="rounded-xl border border-red-200/18 bg-red-500/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-red-100 disabled:opacity-40"
							>
								Lobby leeren
							</button>
						</>
					) : null}
				</div>
			</header>
			<div className="grid gap-px bg-white/8 lg:grid-cols-2">
				{teams.map((teamName) => (
					<div key={teamName} className="bg-[#08150f] p-4 sm:p-5">
						<h3 className="mb-3 text-lg font-black text-emerald-50">{teamName}</h3>
						<div className="grid gap-2">
							{lobby.slots
								.filter((slot) => slot.teamName === teamName)
								.map((slot) => {
									const own = slot.slotId === lobby.currentSlotId;
									return (
										<div
											key={slot.slotId}
											className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-2 ${own ? "border-lime-200/30 bg-lime-200/10" : slot.discordId ? "border-white/9 bg-black/18" : "border-dashed border-cyan-200/16 bg-cyan-300/[0.035]"}`}
										>
											<div className="min-w-0">
												<div className="text-[8px] font-black uppercase tracking-[0.18em] text-cyan-100/46">{slot.role}</div>
												<div className="truncate text-sm font-black text-emerald-50">{slot.displayName ?? "Platz frei"}</div>
											</div>
											{slot.discordId ? (
												lobby.isAdmin && !own ? (
													<button
														type="button"
														disabled={isPending}
														onClick={() => act("release", slot.slotId)}
														className="rounded-lg border border-red-200/14 px-2 py-1.5 text-[8px] font-black uppercase text-red-100/64"
													>
														Freigeben
													</button>
												) : (
													<span className="text-[8px] font-black uppercase tracking-[0.14em] text-lime-100/48">{own ? "Dein Platz" : "Belegt"}</span>
												)
											) : (
												<button
													type="button"
													disabled={isPending || Boolean(lobby.currentSlotId)}
													onClick={() => act("claim", slot.slotId)}
													className="rounded-lg bg-gradient-to-r from-lime-200 to-cyan-200 px-3 py-2 text-[8px] font-black uppercase text-emerald-950 disabled:opacity-35"
												>
													Belegen
												</button>
											)}
										</div>
									);
								})}
						</div>
					</div>
				))}
			</div>
			{message ? <div className="border-t border-white/8 px-5 py-3 text-xs font-bold text-emerald-100/70">{message}</div> : null}
			<ConfirmDialog
				open={soloOpen}
				title="Solo-Test mit zehn Dummies starten?"
				description="Die aktuelle Testlobby und alle vorhandenen Test-Rolls werden zurückgesetzt. Danach kannst du direkt auf dieser Seite jeden der zehn Spieler einzeln würfeln, rerollen und bestätigen. Echte Turnierdaten bleiben unangetastet."
				confirmLabel="Solo-Test starten"
				cancelLabel="Abbrechen"
				onCancel={() => setSoloOpen(false)}
				onConfirm={() => act("solo")}
			/>
			<ConfirmDialog
				open={resetOpen}
				title="Gesamte Testlobby leeren?"
				description="Alle zehn Platzbelegungen und sämtliche ub-test-Rolls werden gelöscht. Echte Teams, Swiss-Paarungen und Matches bleiben unangetastet."
				confirmLabel="Testlobby leeren"
				cancelLabel="Abbrechen"
				tone="danger"
				onCancel={() => setResetOpen(false)}
				onConfirm={() => act("reset")}
			/>
		</section>
	);
}
