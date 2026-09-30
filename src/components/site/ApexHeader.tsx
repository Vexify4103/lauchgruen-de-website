import { auth } from "@/lib/auth";
import { TournamentAccountControl } from "@/app/tournament/TournamentAccountControl";
import { SiteHeader } from "./SiteHeader";

/** Header for the main site (lauchgruen.de): stream hub, clips, OBS tools and the account center. */
export async function ApexHeader({ apexUrl, tournamentUrl, brand }: { apexUrl: string; tournamentUrl: string; brand?: string }) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	const account = discordId
		? {
				discordHandle: session.user.discordHandle ?? session.user.name ?? "Discord",
				discordAvatar: session.user.discordAvatar,
				discordInGuild: session.user.discordInGuild,
				isOwner: false,
			}
		: null;
	return (
		<SiteHeader
			homeHref="/"
			homeLabel="Lauchgruen Startseite"
			brand={brand}
			navItems={[
				{ href: "/", label: "Start", matches: ["/landing"] },
				{ href: "/clips", label: "Clips" },
				{ href: "/overlay", label: "OBS-Tools" },
				{ href: tournamentUrl, label: "Turnier", external: true },
			]}
			status={
				<a
					href="https://www.twitch.tv/lauchgruen"
					target="_blank"
					rel="noreferrer"
					className="button small max-[760px]:hidden"
					style={{ background: "#9146ff", color: "#fff" }}
				>
					Twitch <span aria-hidden="true">↗</span>
				</a>
			}
			account={<TournamentAccountControl account={account} accountUrl={`${apexUrl}/me?from=main`} />}
		/>
	);
}
