"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TournamentTwitchLink } from "@/lib/tournament-storage";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TwitchMark } from "@/components/BrandMarks";

const statusMessages: Record<string, string> = {
	connected: "Dein Twitch-Kanal wurde erfolgreich verbunden.",
	cancelled: "Die Twitch-Verknüpfung wurde abgebrochen.",
	"login-required": "Bitte melde dich zuerst mit Discord an.",
	"invalid-state": "Die Twitch-Anfrage ist abgelaufen. Bitte versuche es erneut.",
	configuration: "Twitch OAuth ist noch nicht vollständig konfiguriert.",
	failed: "Twitch konnte nicht verbunden werden. Bitte versuche es erneut.",
};

type TwitchSetting = "showWhenLive" | "showInCommunityOverlay";

export function TwitchLinkCard({
	initialLink,
	status,
	isOwner,
	verifiedRiotId,
	returnSource,
}: {
	initialLink: TournamentTwitchLink | null;
	status?: string;
	isOwner: boolean;
	verifiedRiotId: string | null;
	returnSource: "main" | "overlay" | "tournament";
}) {
	const router = useRouter();
	const [link, setLink] = useState(initialLink);
	const [busy, setBusy] = useState(false);
	const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
	const [message, setMessage] = useState(status ? statusMessages[status] : "");

	async function updateSetting(setting: TwitchSetting, value: boolean) {
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch("/api/twitch/link", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ [setting]: value }),
			});
			const json = (await response.json()) as {
				link?: TournamentTwitchLink;
				message?: string;
			};
			if (!response.ok || !json.link) {
				throw new Error(json.message ?? "Einstellung konnte nicht gespeichert werden.");
			}
			setLink(json.link);
			setMessage(setting === "showInCommunityOverlay" ? "Community-Overlay-Freigabe gespeichert." : "Twitch-Anzeige gespeichert.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
		} finally {
			setBusy(false);
		}
	}

	async function disconnect() {
		setDisconnectConfirmOpen(false);
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch("/api/twitch/link", { method: "DELETE" });
			const json = (await response.json()) as { message?: string };
			if (!response.ok) {
				throw new Error(json.message ?? "Twitch konnte nicht getrennt werden.");
			}
			setLink(null);
			setMessage("Twitch-Verknüpfung entfernt.");
			router.refresh();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Trennen fehlgeschlagen.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<article id="streamer-overlay" className={`connection-card ${link ? "connected twitch" : "twitch"}`}>
			<span>
				<TwitchMark />
			</span>
			<div>
				<small>Stream-Identität</small>
				<h3>Twitch</h3>
				<p>{link ? link.displayName : "Nicht verknüpft"}</p>
			</div>
			{link ? (
				<button type="button" className="connection-action danger" disabled={busy} onClick={() => setDisconnectConfirmOpen(true)}>
					Trennen
				</button>
			) : (
				<a href={`/api/twitch/connect?from=${returnSource}`} className="connection-action twitch">
					Verbinden ↗
				</a>
			)}
			<div className="connection-body">
				{link ? (
					<>
						<SettingToggle
							checked={link.showWhenLive}
							disabled={busy}
							title="Während meiner Turniermatches anzeigen"
							description="Ein Stream-Link erscheint nur, wenn dein Turniermatch live ist und dein Kanal tatsächlich sendet."
							onChange={(value) => void updateSetting("showWhenLive", value)}
						/>
						<SettingToggle
							checked={Boolean(link.showInCommunityOverlay)}
							disabled={busy || !verifiedRiotId}
							title="Als Streamer in Community-Overlays erscheinen"
							description={
								verifiedRiotId
									? `Taucht ${verifiedRiotId} in einem erkannten Live-Spiel auf, dürfen Overlays deinen Twitch-Namen zeigen. Deine Discord-ID bleibt verborgen.`
									: "Dafür muss zuerst deine Riot-ID verifiziert sein."
							}
							onChange={(value) => void updateSetting("showInCommunityOverlay", value)}
						/>
						<div className="connection-actions">
							<a href={`https://twitch.tv/${encodeURIComponent(link.login)}`} target="_blank" rel="noreferrer" className="connection-action">
								Kanal öffnen ↗
							</a>
							<a href={`/api/twitch/connect?from=${returnSource}`} className="connection-action">
								Anderes Konto verbinden
							</a>
							{isOwner && link.showWhenLive ? (
								<a href="/tournament/teams?twitchPreview=1" className="connection-action">
									Live-Anzeige testen
								</a>
							) : null}
						</div>
					</>
				) : (
					<p>Verbinde deinen Kanal, damit dein Stream bei Live-Matches und auf Wunsch in Community-Overlays erscheint. Du kannst die Freigaben jederzeit ändern.</p>
				)}
				{message ? (
					<p role="status" className="account-message">
						{message}
					</p>
				) : null}
			</div>
			<ConfirmDialog
				open={disconnectConfirmOpen}
				title="Twitch-Verknüpfung entfernen?"
				description="Dein Twitch-Kanal wird vom Profil getrennt und erscheint weder bei Live-Matches noch in Community-Overlays."
				confirmLabel="Verbindung trennen"
				cancelLabel="Abbrechen"
				tone="danger"
				onCancel={() => setDisconnectConfirmOpen(false)}
				onConfirm={() => void disconnect()}
			/>
		</article>
	);
}

function SettingToggle({
	checked,
	disabled,
	title,
	description,
	onChange,
}: {
	checked: boolean;
	disabled: boolean;
	title: string;
	description: string;
	onChange: (value: boolean) => void;
}) {
	return (
		<label className="setting-toggle" aria-disabled={disabled}>
			<input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
			<i />
			<span>
				<strong>{title}</strong>
				<small>{description}</small>
			</span>
		</label>
	);
}
