import { signIn } from "@/lib/auth";
import { cleanTournamentHref } from "@/lib/tournament-url";
import { TournamentLink as Link } from "./TournamentLink";

export type TournamentAccount = {
	discordHandle: string;
	discordAvatar?: string;
	discordInGuild?: boolean;
	isOwner: boolean;
};

export function TournamentAccountControl({ account, cleanUrls, compact = false }: { account: TournamentAccount | null; cleanUrls: boolean; compact?: boolean }) {
	const meHref = cleanTournamentHref("/tournament/me", cleanUrls);

	if (!account) {
		return (
			<form
				action={async () => {
					"use server";
					await signIn("discord", { redirectTo: meHref });
				}}
				className={compact ? "w-full" : "shrink-0"}
			>
				<button
					type="submit"
					aria-label="Mit Discord anmelden"
					title="Mit Discord anmelden"
					className={`grid place-items-center rounded-full border border-[#E0E3FF]/40 bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/20 transition hover:scale-105 hover:border-[#E0E3FF]/70 hover:bg-[#4752C4] ${
						compact ? "mx-auto size-11" : "size-12"
					}`}
				>
					<DiscordIcon />
				</button>
			</form>
		);
	}

	return (
		<Link
			href="/tournament/me"
			aria-label={`Mein Status: ${account.discordHandle}`}
			title={`${account.discordHandle}${account.isOwner ? " · Admin" : ""}`}
			className={`relative grid shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-300/10 shadow-lg shadow-lime-400/10 transition hover:scale-105 hover:border-lime-200/44 ${
				compact ? "mx-auto size-11" : "size-12"
			}`}
		>
			{account.discordAvatar ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={account.discordAvatar} alt="" className="size-full rounded-full object-cover" referrerPolicy="no-referrer" />
			) : (
				<span className="text-sm font-black text-lime-100">{initials(account.discordHandle)}</span>
			)}
			<span
				className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-[#07110c] ${account.discordInGuild === false ? "bg-amber-300" : "bg-lime-300"}`}
			/>
		</Link>
	);
}

function initials(handle: string) {
	return (
		handle
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join("") || "DC"
	);
}

function DiscordIcon() {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="currentColor">
			<path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 2.854a.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027 14.1 14.1 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.12 13.12 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.55-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
		</svg>
	);
}
