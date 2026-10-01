"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

type Progress = { discordConnected: boolean; riotVerified: boolean; submitted: boolean };
const ProgressContext = createContext<Progress | null>(null);
const UpdateContext = createContext<Dispatch<SetStateAction<Progress>> | null>(null);

export function ApplicationProgressProvider({ initialProgress, children }: { initialProgress: Progress; children: ReactNode }) {
	const [progress, setProgress] = useState(initialProgress);
	return (
		<ProgressContext.Provider value={progress}>
			<UpdateContext.Provider value={setProgress}>{children}</UpdateContext.Provider>
		</ProgressContext.Provider>
	);
}

export function useApplicationProgressUpdate() {
	return useContext(UpdateContext);
}

export function ApplicationJourney() {
	const progress = useContext(ProgressContext);
	if (!progress) return null;
	const steps = [
		{ label: "Discord verbinden", complete: progress.discordConnected, detail: progress.discordConnected ? "Verbunden" : "Mit deinem Account anmelden" },
		{ label: "Riot-ID verifizieren", complete: progress.riotVerified, detail: progress.riotVerified ? "Account bestätigt" : "Besitz per Profilicon bestätigen" },
		{ label: "Bewerbung senden", complete: progress.submitted, detail: progress.submitted ? "Gespeichert · Änderungen möglich" : "Rollen und Verfügbarkeit angeben" },
	];
	return (
		<div>
			<p role="status" className="mt-3 text-sm font-semibold text-[var(--accent)]">
				{steps.filter((step) => step.complete).length} von 3 Schritten abgeschlossen
			</p>
			<ol className="application-steps" aria-label="Bewerbungsfortschritt">
				{steps.map((step, index) => (
					<li key={step.label} data-complete={step.complete}>
						<span aria-hidden="true">{step.complete ? "✓" : `0${index + 1}`}</span>
						<div>
							<strong>{step.label}</strong>
							<small>{step.detail}</small>
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}
