import { OverlayBuilderClient } from "./OverlayBuilderClient";
import { parseCommunityOverlayConfig } from "@/lib/community-overlay-config";
import { auth } from "@/lib/auth";
import { getTwitchLink, getVerifiedAccount } from "@/lib/tournament-storage";
import { headers } from "next/headers";
import { getSiteUrls } from "@/lib/site-urls";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "League OBS Overlay Builder | Lauchgruen",
	description: "Erstelle eine anpassbare League-of-Legends-Browserquelle für OBS.",
};

export default async function OverlayBuilderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const raw = await searchParams;
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(raw)) {
		if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
		else if (value !== undefined) params.set(key, value);
	}
	const initialConfig = parseCommunityOverlayConfig(params);
	const session = await auth();
	const discordId = session?.user?.discordId;
	const hasRiotOverride = Boolean(params.get("account")?.trim() || params.get("ingame")?.trim());
	const hasTwitchOverride = Boolean(params.get("streamer")?.trim());
	if (discordId && (!hasRiotOverride || !hasTwitchOverride)) {
		const [verified, twitch] = await Promise.all([getVerifiedAccount(discordId), getTwitchLink(discordId)]);
		if (!hasRiotOverride && verified) {
			initialConfig.ingame = verified.riotId;
		}
		if (!hasTwitchOverride && twitch) initialConfig.streamer = twitch.login;
	}
	const requestHeaders = await headers();
	const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "lauchgruen.de";
	const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
	const apexUrl = getSiteUrls(host).apex;
	return (
		<>
			<OverlayBuilderClient initialConfig={initialConfig} baseUrl={`${protocol}://${host}`} apexUrl={apexUrl} accountUrl={`${apexUrl}/overlay/account`} />
			<SiteFooter apexUrl={apexUrl} tournamentUrl={getSiteUrls(host).tournament} />
		</>
	);
}
