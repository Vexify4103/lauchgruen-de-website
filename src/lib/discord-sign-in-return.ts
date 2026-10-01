import { cleanTournamentHref, isTournamentHost } from "@/lib/tournament-url";

export function discordSignInReturnUrl(redirectTo: string, currentUrl: string): string {
	const current = new URL(currentUrl);
	const path = cleanTournamentHref(redirectTo, isTournamentHost(current.host));
	// OAuth may finish on the shared auth host, not the page that started it.
	return new URL(path, current.origin).toString();
}
