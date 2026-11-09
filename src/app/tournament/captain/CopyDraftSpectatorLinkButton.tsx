"use client";

import { useState } from "react";
import { useTournamentHref } from "../TournamentLink";

export function CopyDraftSpectatorLinkButton({ matchId, perspective, disabled }: { matchId: string; perspective: "blue" | "red"; disabled?: boolean }) {
	const [copied, setCopied] = useState(false);
	const spectatorPath = useTournamentHref(`/tournament/champ-select/${matchId}/${perspective}`);

	async function copy() {
		if (disabled) return;
		const url = new URL(spectatorPath, window.location.origin);
		await navigator.clipboard.writeText(url.toString());
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1800);
	}

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={copy}
			className="rounded-[10px] border border-[var(--line-strong)] px-5 py-3 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)]"
		>
			{disabled ? "Draft pausiert" : copied ? "Link kopiert" : "Draft-Link fürs Team kopieren"}
		</button>
	);
}
