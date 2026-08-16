"use client";

import Image from "next/image";
import { TournamentLink as Link } from "../TournamentLink";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { TournamentApplication } from "@/lib/tournament-storage";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ThemedMultiSelect, ThemedSelect } from "@/components/ThemedSelect";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { WithdrawApplicationButton } from "../me/WithdrawApplicationButton";

type SubmitState = { status: "idle"; message: "" } | { status: "loading"; message: string } | { status: "success"; message: string } | { status: "error"; message: string };

const initialState: SubmitState = { status: "idle", message: "" };
const roleOptions = ["Top", "Jungle", "Mid", "Bot", "Support", "Fill"];

type DiscordIdentity = { id: string; handle: string } | null;

type VerifiedAccount = {
	riotId: string;
	puuid: string;
	currentRankAuto: string | null;
	verifiedAt: string;
	summonerLevel?: number;
} | null;

type Challenge = {
	riotId: string;
	expectedIconId: number;
	expectedIconUrl: string;
	currentIconId: number;
	currentIconUrl?: string;
	expiresAt: string;
	checkedAt?: string;
	revisionDate?: number;
};

type ExistingApplication = Pick<
	TournamentApplication,
	"displayName" | "mainRole" | "preferredRoles" | "availableAllDates" | "notes" | "acceptedRules" | "acceptedDataStorage" | "discordDmOptIn"
>;

function linkedRiotId(riotId: string) {
	return encodeURIComponent(riotId.replace("#", "-"));
}

function opggUrl(riotId: string) {
	return `https://www.op.gg/summoners/euw/${linkedRiotId(riotId)}`;
}

function dpmUrl(riotId: string) {
	return `https://dpm.lol/${linkedRiotId(riotId)}`;
}

function serializeApplicationForm(form: HTMLFormElement | null) {
	if (!form) return "";
	return JSON.stringify([...new FormData(form).entries()].map(([key, value]) => [key, String(value)]));
}

export function ApplicationForm({
	discordIdentity,
	isGuildMember,
	discordInviteUrl,
	initialVerified,
	initialApplication,
	minimumSummonerLevel,
	minimumLevelOverrideKind,
	announcedDate,
	applicationDeadlineLabel,
}: {
	discordIdentity: DiscordIdentity;
	isGuildMember: boolean;
	discordInviteUrl: string;
	initialVerified: VerifiedAccount;
	initialApplication: ExistingApplication | null;
	minimumSummonerLevel: number;
	minimumLevelOverrideKind: "regular" | "exception" | null;
	announcedDate: string;
	applicationDeadlineLabel: string;
}) {
	const [verified, setVerified] = useState<VerifiedAccount>(initialVerified);
	const [preferredRoles, setPreferredRoles] = useState<string[]>(initialApplication?.preferredRoles ?? []);
	const [hasApplication, setHasApplication] = useState(Boolean(initialApplication));
	const [state, setState] = useState<SubmitState>(initialState);
	const [guildMember, setGuildMember] = useState(isGuildMember);
	const [membershipStatus, setMembershipStatus] = useState<
		{ kind: "idle"; message: "" } | { kind: "loading"; message: string } | { kind: "error"; message: string } | { kind: "success"; message: string }
	>({ kind: "idle", message: "" });
	const formRef = useRef<HTMLFormElement>(null);
	const [savedForm, setSavedForm] = useState("");
	const [currentForm, setCurrentForm] = useState("");

	function syncCurrentForm() {
		setCurrentForm(serializeApplicationForm(formRef.current));
	}

	useEffect(() => {
		if (!formRef.current || savedForm) return;
		const serialized = serializeApplicationForm(formRef.current);
		setSavedForm(serialized);
		setCurrentForm(serialized);
	}, [savedForm, verified]);

	useUnsavedChanges({
		dirty: Boolean(verified && savedForm && currentForm !== savedForm),
		label: "Turnierbewerbung",
		save: persistApplication,
	});

	async function persistApplication(): Promise<boolean> {
		if (!discordIdentity) {
			setState({ status: "error", message: "Bitte zuerst mit Discord anmelden." });
			return false;
		}
		if (!verified) {
			setState({ status: "error", message: "Bitte zuerst deinen Riot-Account verifizieren." });
			return false;
		}
		if (preferredRoles.length === 0) {
			setState({ status: "error", message: "Bitte wähle mindestens eine Wunschrolle aus." });
			return false;
		}

		const form = formRef.current;
		if (!form) return false;
		const formData = new FormData(form);
		setState({
			status: "loading",
			message: hasApplication ? "Änderungen werden gespeichert..." : "Bewerbung wird abgeschickt...",
		});

		const payload = {
			displayName: String(formData.get("displayName") ?? ""),
			mainRole: String(formData.get("mainRole") ?? ""),
			preferredRoles: formData.getAll("preferredRoles").map(String),
			availableAllDates: formData.get("availableAllDates") === "on",
			notes: String(formData.get("notes") ?? ""),
			acceptedRules: formData.get("acceptedRules") === "on",
			acceptedDataStorage: formData.get("acceptedDataStorage") === "on",
			discordDmOptIn: formData.get("discordDmOptIn") === "on",
		};

		const response = await fetch("/api/tournament/applications", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});

		const result = (await response.json().catch(() => null)) as { message?: string } | null;

		if (!response.ok) {
			setState({
				status: "error",
				message: result?.message ?? "Bewerbung konnte noch nicht abgeschickt werden.",
			});
			return false;
		}

		setState({
			status: "success",
			message: result?.message ?? "Bewerbung gespeichert.",
		});
		setHasApplication(true);
		const serialized = serializeApplicationForm(form);
		setSavedForm(serialized);
		setCurrentForm(serialized);
		return true;
	}

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void persistApplication();
	}

	if (!discordIdentity) {
		return (
			<div className="rounded-2xl border border-amber-200/24 bg-amber-200/10 px-4 py-3 text-sm leading-6 text-amber-50">
				Bitte zuerst mit Discord anmelden, bevor du dich bewirbst. So weiß das Orga-Team sicher, welcher Discord-Account zur Bewerbung gehört.
			</div>
		);
	}

	async function recheckMembership() {
		setMembershipStatus({
			kind: "loading",
			message: "Discord-Mitgliedschaft wird geprüft...",
		});
		const response = await fetch("/api/tournament/membership", {
			cache: "no-store",
		});
		const result = (await response.json().catch(() => null)) as { member?: boolean; message?: string } | null;

		if (response.ok && result?.member) {
			setGuildMember(true);
			setMembershipStatus({
				kind: "success",
				message: result.message ?? "Discord-Mitgliedschaft bestätigt.",
			});
			return;
		}

		setMembershipStatus({
			kind: "error",
			message: result?.message ?? "Noch nicht gefunden. Falls du gerade beigetreten bist, warte kurz und versuche es erneut.",
		});
	}

	if (!guildMember) {
		return (
			<div className="rounded-[1.7rem] border border-indigo-200/24 bg-indigo-300/[0.08] p-5">
				<div className="text-xs font-black uppercase tracking-[0.24em] text-indigo-100/72">Discord erforderlich</div>
				<h2 className="mt-3 text-2xl font-black text-indigo-50">Tritt dem Lauchgruen Discord bei, um fortzufahren.</h2>
				<p className="mt-3 text-sm leading-7 text-emerald-100/72">
					Turnierbewerbungen sind nur für Mitglieder des Discord-Servers möglich. Tritt zuerst bei und klicke danach auf den Prüfbutton. Du musst dich dafür nicht aus-
					und wieder einloggen.
				</p>
				<div className="mt-5 flex flex-wrap gap-3">
					<a
						href={discordInviteUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex rounded-2xl bg-indigo-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-indigo-950 transition hover:-translate-y-0.5"
					>
						Discord beitreten
					</a>
					<button
						type="button"
						onClick={recheckMembership}
						disabled={membershipStatus.kind === "loading"}
						className="inline-flex rounded-2xl border border-white/14 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-indigo-200/40 hover:text-indigo-50 disabled:opacity-60"
					>
						{membershipStatus.kind === "loading" ? "Prüfe..." : "Ich bin beigetreten, erneut prüfen"}
					</button>
				</div>
				{membershipStatus.message ? (
					<div
						className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
							membershipStatus.kind === "success"
								? "border-lime-200/24 bg-lime-200/10 text-lime-50"
								: membershipStatus.kind === "error"
									? "border-red-300/30 bg-red-500/10 text-red-100"
									: "border-indigo-200/24 bg-indigo-200/10 text-indigo-50"
						}`}
					>
						{membershipStatus.message}
					</div>
				) : null}
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
				ref={formRef}
				onSubmit={onSubmit}
				onInput={syncCurrentForm}
				onChange={syncCurrentForm}
				onClickCapture={() => {
					window.setTimeout(syncCurrentForm, 0);
				}}
				className={`grid gap-5 ${verified ? "" : "pointer-events-none opacity-50"}`}
			>
				<div className="rounded-2xl border border-cyan-200/16 bg-cyan-300/[0.06] px-4 py-3">
					<div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/68">Schritt 3 von 3 · Bewerbung ausfüllen und senden</div>
				</div>
				{hasApplication ? (
					<div className="rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold leading-6 text-cyan-50">
						<div>Du bist bereits angemeldet. Hier kannst du deine Bewerbung aktualisieren.</div>
						<div className="mt-2 text-cyan-50/78">
							Auf deiner{" "}
							<Link href="/tournament/me" className="font-black text-cyan-100 underline decoration-cyan-200/40 underline-offset-4 hover:text-white">
								Profilseite
							</Link>{" "}
							kannst du außerdem ein Wunschduo erstellen oder einem Code beitreten und optional deinen Twitch-Account verbinden.
						</div>
					</div>
				) : null}
				{minimumLevelOverrideKind ? (
					<div className="rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold leading-6 text-cyan-50">
						<span className="font-black">Teilnahme-Freigabe aktiv:</span> Dein Account-Mindestlevel wird als{" "}
						{minimumLevelOverrideKind === "regular" ? "Dauergast" : "Ausnahme"} nicht blockiert. Discord-Mitgliedschaft, Riot-Verifizierung und alle übrigen Regeln
						gelten weiterhin.
					</div>
				) : null}

				<label className="grid gap-2">
					<span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">Angekündigte Turniertermine</span>
					<input value={announcedDate} readOnly className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none" />
				</label>

				<Consent name="availableAllDates" defaultChecked={initialApplication?.availableAllDates ?? false}>
					Ich kann an beiden angekündigten Turniertagen verbindlich teilnehmen und bin mindestens 20 Minuten vor Start im Voice-Call. Wenn ich unsicher bin, schreibe ich
					es in die Notizen.
				</Consent>

				<div className="grid gap-4 md:grid-cols-2">
					<Field label="Anzeigename" name="displayName" placeholder="Wie soll das Orga-Team dich nennen?" defaultValue={initialApplication?.displayName ?? ""} />
					<ThemedSelectField label="Main Rolle" name="mainRole" options={roleOptions} initialValue={initialApplication?.mainRole ?? ""} />
					<ReadOnlyField label="Riot-ID (verifiziert)" value={verified?.riotId ?? "—"} />
					<ReadOnlyField label="Discord-Account" value={discordIdentity.handle} />
					<ReadOnlyField label="Aktueller Rang (von Riot)" value={verified?.currentRankAuto ?? "Unranked"} />
					<ReadOnlyField
						label={minimumLevelOverrideKind ? "Account-Level (Freigabe aktiv)" : `Account-Level (mindestens ${minimumSummonerLevel})`}
						value={verified?.summonerLevel ? String(verified.summonerLevel) : minimumLevelOverrideKind ? "Freigegeben" : "Neu verifizieren"}
					/>
				</div>

				<div className="grid gap-2">
					<label className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">Wunschrollen</label>
					<p className="text-xs leading-5 text-emerald-100/58">
						Die Reihenfolge zählt beim Team-Balancing: Deine zuerst gewählte Rolle ist Wunsch #1, die nächste Wunsch #2 usw. Klicke die Rollen deshalb in deiner
						tatsächlichen Wunschreihenfolge an. <strong className="text-emerald-50">Fill</strong> bedeutet jede Rolle und kann nicht mit Einzelrollen kombiniert werden.
						Die Reihenfolge wird bestmöglich berücksichtigt, ist wegen fairer Teams aber keine Garantie.
					</p>
					<ThemedMultiSelect
						name="preferredRoles"
						value={preferredRoles}
						onChange={setPreferredRoles}
						placeholder="Eine oder mehrere Rollen wählen"
						options={roleOptions.map((role) => ({ value: role, label: role }))}
						ordered
						exclusiveValues={["Fill"]}
					/>
					{preferredRoles.length ? (
						<div className="flex flex-wrap gap-2">
							{preferredRoles.map((role, index) => (
								<span
									key={role}
									className="rounded-full border border-lime-200/18 bg-lime-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-lime-100"
								>
									<span className="mr-1.5 text-cyan-100">#{index + 1}</span>
									{role}
								</span>
							))}
						</div>
					) : null}
				</div>

				<label className="grid gap-2">
					<span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">Notizen</span>
					<textarea
						name="notes"
						rows={3}
						defaultValue={initialApplication?.notes ?? ""}
						placeholder="Mitspieler, Shotcalling-Erfahrung, Stream-Einschränkungen oder Hinweise zur Verfügbarkeit."
						className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none transition placeholder:text-emerald-100/34 focus:border-lime-200/40"
					/>
				</label>

				<div className="grid gap-3">
					<Consent name="acceptedRules" defaultChecked={initialApplication?.acceptedRules ?? false}>
						Ich habe die Ultimate-Bravery-Regeln gelesen und verstehe, dass toxisches Verhalten, Roll-Missbrauch oder absichtliches Stören zum Ausschluss führen kann.
					</Consent>
					<Consent name="acceptedDataStorage" defaultChecked={initialApplication?.acceptedDataStorage ?? false}>
						Ich bin damit einverstanden, dass meine Turnierbewerbung zur Eventorganisation gespeichert wird.
					</Consent>
					<Consent name="discordDmOptIn" defaultChecked={initialApplication?.discordDmOptIn !== false} required={false}>
						Ich möchte wichtige Turnier-Neuigkeiten per Discord-DM vom Bot erhalten, zum Beispiel meine veröffentlichte Teamzuweisung und einen Captain-Status.
					</Consent>
				</div>

				{state.message ? (
					<div
						className={`rounded-2xl border px-4 py-3 text-sm ${
							state.status === "error" ? "border-red-300/30 bg-red-500/10 text-red-100" : "border-lime-200/24 bg-lime-200/10 text-lime-50"
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
					{state.status === "loading"
						? hasApplication
							? "Änderungen werden gespeichert..."
							: "Wird abgeschickt..."
						: hasApplication
							? "Bewerbung ändern"
							: "Bewerbung absenden"}
				</button>
				{hasApplication ? (
					<div className="rounded-2xl border border-rose-300/14 bg-rose-400/[0.045] p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
						<div>
							<div className="text-xs font-black text-emerald-50">Du kannst doch nicht teilnehmen?</div>
							<p className="mt-1 text-xs leading-5 text-emerald-100/50">Bis zum Bewerbungsschluss kannst du deine Anmeldung selbst zurückziehen.</p>
						</div>
						<WithdrawApplicationButton
							deadlineLabel={applicationDeadlineLabel}
							className="mt-3 shrink-0 sm:mt-0"
							onWithdrawn={(message) => {
								setHasApplication(false);
								setState({ status: "success", message });
							}}
						/>
					</div>
				) : null}
				<p className="text-xs leading-5 text-emerald-100/48">
					Mit dem Absenden bestätigst du verbindlich die{" "}
					<Link href="/tournament/terms" className="font-black text-lime-100 underline decoration-lime-200/40 underline-offset-4">
						Teilnahmebedingungen
					</Link>{" "}
					und die{" "}
					<Link href="/tournament/privacy" className="font-black text-lime-100 underline decoration-lime-200/40 underline-offset-4">
						Datenschutzhinweise
					</Link>{" "}
					für dieses Turnier.
				</p>
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
	const [status, setStatus] = useState<{ kind: "idle" } | { kind: "loading"; message: string } | { kind: "error"; message: string }>({ kind: "idle" });
	const [disconnecting, setDisconnecting] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [unlinkError, setUnlinkError] = useState<string | null>(null);

	async function performDisconnect() {
		setConfirmOpen(false);
		setDisconnecting(true);
		setUnlinkError(null);
		const response = await fetch("/api/riot/disconnect", { method: "POST" });
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
						<div className="text-xs font-black uppercase tracking-[0.2em] text-lime-100/68">Schritt 2 von 3 · abgeschlossen</div>
						<div className="mt-2 text-sm font-black text-lime-50">Riot-Account verifiziert</div>
						<div className="mt-1 grid gap-1">
							<div className="text-lg font-black text-lime-50">{verified.riotId}</div>
							<div className="text-xs text-lime-100/70">Aktueller Rang (von Riot): {verified.currentRankAuto ?? "Unranked"}</div>
							<div className="text-xs text-lime-100/52">Verifiziert {new Date(verified.verifiedAt).toLocaleString("de-DE")}</div>
						</div>
						<div className="mt-4 flex flex-wrap gap-2">
							<a
								href={opggUrl(verified.riotId)}
								target="_blank"
								rel="noreferrer"
								className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-lime-50/80 hover:text-lime-50"
							>
								OP.GG
							</a>
							<a
								href={dpmUrl(verified.riotId)}
								target="_blank"
								rel="noreferrer"
								className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-lime-50/80 hover:text-lime-50"
							>
								DPM
							</a>
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
				{unlinkError ? <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-xs text-red-100">{unlinkError}</div> : null}
				<ConfirmDialog
					open={confirmOpen}
					title="Riot-Account wirklich trennen?"
					description={
						<>
							Jede für diesen Discord-Account eingereichte Bewerbung wird ebenfalls entfernt. Du kannst dich direkt danach mit einer anderen Riot-ID neu verifizieren.
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
		const response = await fetch("/api/riot/start", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ riotId: riotIdInput.trim() }),
		});
		const result = (await response.json().catch(() => null)) as (Challenge & { message?: string }) | { message?: string } | null;
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
		if (!challenge) return;
		if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
			setChallenge(null);
			setStatus({ kind: "error", message: "Die Verifizierung ist abgelaufen. Starte bitte eine neue Challenge." });
			return;
		}

		// Summoner-v4 can briefly lag behind the League client. Check frequently
		// for a short window, then return control instead of blocking for a minute.
		const MAX_ATTEMPTS = 5;
		const DELAY_MS = 2500;

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
			const label = attempt === 1 ? "Icon wird geprüft..." : `Riot synchronisiert noch · Versuch ${attempt}/${MAX_ATTEMPTS}`;
			setStatus({ kind: "loading", message: label });

			const response = await fetch("/api/riot/verify", { method: "POST", cache: "no-store" });
			const result = (await response.json().catch(() => null)) as {
				verified?: {
					riotId: string;
					puuid: string;
					currentRankAuto: string | null;
					summonerLevel?: number;
					verifiedAt: string;
				};
				message?: string;
				currentIconId?: number;
				currentIconUrl?: string;
				checkedAt?: string;
				revisionDate?: number;
			} | null;

			if (response.ok && result?.verified) {
				onVerified(result.verified);
				setChallenge(null);
				setStatus({ kind: "idle" });
				return;
			}

			if (response.status === 404 || response.status === 410) {
				setChallenge(null);
				setStatus({
					kind: "error",
					message: result?.message ?? "Die Verifizierung ist nicht mehr aktiv. Starte bitte eine neue Challenge.",
				});
				return;
			}

			if (response.status === 409) {
				setChallenge((current) =>
					current
						? {
								...current,
								currentIconId: result?.currentIconId ?? current.currentIconId,
								currentIconUrl: result?.currentIconUrl ?? current.currentIconUrl,
								checkedAt: result?.checkedAt ?? new Date().toISOString(),
								revisionDate: result?.revisionDate,
							}
						: current
				);
			}

			// Only retry on 409 (icon mismatch) — other failures stop immediately.
			if (response.status !== 409 || attempt === MAX_ATTEMPTS) {
				setStatus({
					kind: "error",
					message: result?.message ?? "Das Icon ist noch nicht bei Riot sichtbar. Lass es eingestellt, warte kurz und prüfe dann erneut.",
				});
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
		}
	}

	return (
		<div className="rounded-2xl border border-amber-200/24 bg-amber-200/[0.06] p-5">
			<div className="text-xs font-black uppercase tracking-[0.2em] text-amber-100/72">Schritt 2 von 3 · Riot-Account verifizieren</div>
			<p className="mt-2 text-sm leading-6 text-emerald-100/72">
				Beweise den Besitz deiner Riot-ID, indem du dein League-Profilicon wechselst. Lass das Challenge-Icon eingestellt, bis die Webseite die Verifizierung bestätigt.
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
				<div className="mt-4 rounded-2xl border border-amber-100/12 bg-black/14 p-4">
					<div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
						<RiotIconState label="Benötigtes Icon" iconUrl={challenge.expectedIconUrl} iconId={challenge.expectedIconId} tone="expected" />
						<div className="grid gap-1 text-sm leading-6 text-emerald-100/76">
							<div>Öffne im League-Client dein Profil und setze das gezeigte Icon.</div>
							<div className="text-xs text-amber-100/70">
								<strong className="font-black">Lass dieses Icon aktiv und klicke dann auf „Jetzt prüfen“.</strong> Ein Logout ist nicht nötig. Falls Riot die
								Änderung noch nicht anzeigt, warte kurz und prüfe erneut. Erst nach der grünen Bestätigung kannst du dein altes Icon zurückstellen.
							</div>
							<div className="text-xs text-amber-100/52">Läuft ab um {new Date(challenge.expiresAt).toLocaleTimeString("de-DE")}.</div>
						</div>
						<button
							type="button"
							onClick={verify}
							disabled={status.kind === "loading"}
							className="rounded-2xl bg-lime-200 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-60"
						>
							{status.kind === "loading" ? "Prüfe..." : "Jetzt prüfen"}
						</button>
					</div>
					{challenge.checkedAt && challenge.currentIconUrl ? (
						<div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/8 pt-4">
							<RiotIconState label="Von Riot gemeldet" iconUrl={challenge.currentIconUrl} iconId={challenge.currentIconId} tone="current" />
							<div className="text-xs leading-5 text-emerald-100/52">
								Letzte direkte Riot-Abfrage: <strong className="text-emerald-50">{formatRiotCheckTime(challenge.checkedAt)}</strong>
								<br />
								Wenn hier noch dein vorheriges Icon erscheint, hat Riot die Änderung serverseitig noch nicht übernommen.
							</div>
						</div>
					) : null}
				</div>
			)}

			{status.kind === "loading" ? (
				<div className="mt-3 flex items-center gap-3 rounded-xl border border-cyan-200/20 bg-cyan-300/[0.08] px-4 py-3 text-xs font-bold text-cyan-50">
					<span className="size-4 animate-spin rounded-full border-2 border-cyan-100/25 border-t-cyan-100" aria-hidden="true" />
					{status.message}
				</div>
			) : null}
			{status.kind === "error" ? <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-xs text-red-100">{status.message}</div> : null}
		</div>
	);
}

function RiotIconState({ label, iconUrl, iconId, tone }: { label: string; iconUrl: string; iconId: number; tone: "expected" | "current" }) {
	return (
		<div className="flex items-center gap-3">
			<Image
				src={iconUrl}
				alt={`Profilicon ${iconId}`}
				width={88}
				height={88}
				unoptimized
				className={`size-22 rounded-2xl border ${tone === "expected" ? "border-amber-200/28" : "border-cyan-200/28"}`}
			/>
			<div>
				<div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-100/42">{label}</div>
				<div className="mt-1 text-xs font-black text-emerald-50">Icon ID {iconId}</div>
			</div>
		</div>
	);
}

function formatRiotCheckTime(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "gerade eben" : date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Field({ label, name, placeholder, defaultValue }: { label: string; name: string; placeholder: string; defaultValue?: string }) {
	return (
		<label className="grid gap-2">
			<span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">{label}</span>
			<input
				name={name}
				required
				defaultValue={defaultValue}
				placeholder={placeholder}
				className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none transition placeholder:text-emerald-100/34 focus:border-lime-200/40"
			/>
		</label>
	);
}

function ThemedSelectField({ label, name, options, initialValue = "" }: { label: string; name: string; options: string[]; initialValue?: string }) {
	const [value, setValue] = useState(initialValue);
	return (
		<label className="grid gap-2">
			<span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">{label}</span>
			<ThemedSelect
				name={name}
				value={value}
				onChange={setValue}
				required
				placeholder="Bitte auswählen"
				options={options.map((option) => ({ value: option, label: option }))}
			/>
		</label>
	);
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
	return (
		<label className="grid gap-2">
			<span className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/64">{label}</span>
			<input value={value} readOnly className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm text-emerald-50 outline-none" />
		</label>
	);
}

function Consent({ name, children, defaultChecked = false, required = true }: { name: string; children: ReactNode; defaultChecked?: boolean; required?: boolean }) {
	return (
		<label className="flex gap-3 rounded-2xl border border-white/10 bg-black/16 p-4 text-sm leading-6 text-emerald-100/72">
			<input required={required} type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4 shrink-0 accent-lime-300" />
			<span>{children}</span>
		</label>
	);
}
