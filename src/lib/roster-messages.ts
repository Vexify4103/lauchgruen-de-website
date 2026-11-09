/**
 * Discord messages sent when the roster is published: the personal DM per player and the welcome
 * post in each team's private text channel. Pure builders, so the wording can be tested.
 */
import type { DiscordMessagePayload } from "@/lib/discord";

export const TOURNAMENT_BASE_URL = "https://tournament.lauchgruen.de";
/** Teams meet in their voice channel this long before each tournament day starts. */
export const READY_CHECK_LEAD_MINUTES = 20;

export type RosterMessageRole = "Top" | "Jungle" | "Mid" | "Bot" | "Support" | "Fill" | "Sub";

export type PublishedPlacement = {
	teamKey: string;
	teamName: string;
	role: RosterMessageRole | null;
	isCaptain: boolean;
};

export type TeamChannels = { textChannelId?: string; voiceChannelId?: string };

const ROLE_LABELS: Record<RosterMessageRole, string> = {
	Top: "Toplane",
	Jungle: "Jungle",
	Mid: "Midlane",
	Bot: "Botlane",
	Support: "Support",
	Fill: "Flexibel",
	Sub: "Ersatzspieler:in",
};

function linkButton(label: string, path: string) {
	return { type: 2 as const, style: 5 as const, label, url: `${TOURNAMENT_BASE_URL}${path}` };
}

function unixSeconds(iso: string | null | undefined) {
	if (!iso) return null;
	const time = new Date(iso).getTime();
	return Number.isNaN(time) ? null : Math.floor(time / 1000);
}

export function rosterPublicationMessage(placement: PublishedPlacement | null, channels: TeamChannels = {}): DiscordMessagePayload {
	const commonButtons = [linkButton("Mein Turnierkonto", "/me")];

	if (!placement) {
		return {
			content: "🐻 **Post von Lauchgruen**",
			embeds: [
				{
					author: { name: "LAUCHGRUEN · TURNIERPOST" },
					title: "Deine Teamzuteilung wurde geändert",
					description:
						"Du bist aktuell keinem veröffentlichten Team zugeteilt. Das kann durch eine kurzfristige Rosteränderung passieren. Wenn dir dazu noch keine Information vorliegt, melde dich bitte bei der Turnierleitung.",
					color: 0xe7b955,
					fields: [{ name: "DEIN STATUS", value: "Momentan ohne veröffentlichtes Team", inline: false }],
					footer: { text: "Lauchgruen Community-Turniere · Wir halten dich auf dem Laufenden" },
					timestamp: new Date().toISOString(),
				},
			],
			components: [{ type: 1, components: commonButtons }],
		};
	}

	const role = placement.role ? (ROLE_LABELS[placement.role] ?? placement.role) : "Noch offen";
	const buttons = [...(placement.isCaptain ? [linkButton("Captain-Portal", "/captain")] : []), linkButton("Teamübersicht", "/teams"), ...commonButtons];
	// Channel mentions resolve to clickable links for everyone who can see the channel.
	const channelLines = [
		channels.textChannelId ? `Text: <#${channels.textChannelId}>` : null,
		channels.voiceChannelId ? `Voice: <#${channels.voiceChannelId}>` : null,
	].filter(Boolean);

	return {
		content: "🐻 **Post von Lauchgruen**",
		embeds: [
			{
				author: { name: "LAUCHGRUEN · TURNIERPOST" },
				title: placement.isCaptain ? `Du führst ${placement.teamName} an!` : `Willkommen bei ${placement.teamName}!`,
				description: placement.isCaptain
					? "Die Teams sind veröffentlicht und du wurdest als Captain ausgewählt. Stimme dich mit deinem Team ab und bereite eure Matches im Captain-Portal vor. 💚"
					: "Die Teams sind veröffentlicht und dein Platz steht fest. Lernt euch kennen, stimmt euch für das Turnier ab und habt vor allem eine gute Zeit miteinander. 💚",
				color: 0xb7f36b,
				fields: [
					{ name: "DEIN TEAM", value: `**${placement.teamName}**`, inline: true },
					{ name: "DEINE ROLLE", value: `**${role}**`, inline: true },
					{ name: "DEIN STATUS", value: placement.isCaptain ? "👑 Team-Captain" : "✓ Teammitglied", inline: true },
					...(channelLines.length
						? [{ name: "EUER TEAMCHANNEL", value: `${channelLines.join("\n")}\nDort wartet schon eine Begrüßung mit allen Infos.`, inline: false }]
						: []),
				],
				footer: { text: "Lauchgruen Community-Turniere · Fair spielen, gemeinsam Spaß haben" },
				timestamp: new Date().toISOString(),
			},
		],
		components: [{ type: 1, components: buttons }],
	};
}

export type TeamWelcomeInput = {
	teamName: string;
	roleId?: string;
	captainId?: string | null;
	voiceChannelId?: string;
	tournamentName: string;
	dayOneStartAt: string | null;
	dayTwoStartAt: string | null;
};

function dayLine(label: string, iso: string | null, voiceChannelId?: string) {
	const start = unixSeconds(iso);
	if (start === null) return `**${label}:** Termin folgt`;
	const meet = start - READY_CHECK_LEAD_MINUTES * 60;
	const place = voiceChannelId ? `im <#${voiceChannelId}>` : "im Team-Voice";
	return `**${label}:** <t:${start}:F>\nTreffpunkt ${place}: **<t:${meet}:t>** (<t:${meet}:R>)`;
}

/** Welcome post for a team's private text channel; pings the team role and the captain. */
export function teamWelcomeMessage(input: TeamWelcomeInput): DiscordMessagePayload {
	const mentions = [input.roleId ? `<@&${input.roleId}>` : null, input.captainId ? `<@${input.captainId}>` : null].filter(Boolean).join(" ");
	const captain = input.captainId ? `<@${input.captainId}>` : "wird noch bestimmt";
	return {
		content: `${mentions ? `${mentions} ` : ""}Willkommen in eurem Teamchannel! 🐻💚`,
		embeds: [
			{
				author: { name: `LAUCHGRUEN · ${input.tournamentName.toUpperCase()}` },
				title: `Willkommen, ${input.teamName}!`,
				description:
					"Das ist euer privater Teamchannel. Nur ihr und die Turnierleitung sehen ihn. Lernt euch kennen, sprecht Rollen und Strategie ab und stellt hier eure Fragen.",
				color: 0xb7f36b,
				fields: [
					{ name: "👑 Captain", value: captain, inline: false },
					{
						name: "📅 Turniertage",
						value: [
							dayLine("Tag 1", input.dayOneStartAt, input.voiceChannelId),
							dayLine("Tag 2", input.dayTwoStartAt, input.voiceChannelId),
							`Seid ${READY_CHECK_LEAD_MINUTES} Minuten vor Start vollständig im Voice. Dort läuft der Ready-Check.`,
						].join("\n\n"),
						inline: false,
					},
					{
						name: "🧭 Aufgaben für den Captain",
						value: [
							"1. **Teamnamen festlegen**: im Captain-Portal unter „Teamname“.",
							"2. **Vor jedem Match einchecken**: „Team bereit bestätigen“ im Captain-Portal.",
							"3. **Champ Select führen**: Ready klicken, Bans und Picks locken, am Ende die Rollen verteilen.",
							"4. **Nach dem Match**: Ergebnis-Report im Captain-Portal abgeben.",
							"5. **Ausfall?** Captain-Rolle im Portal an ein Teammitglied übergeben und die Turnierleitung informieren.",
						].join("\n"),
						inline: false,
					},
					{
						name: "✅ Für alle",
						value: "Kommt pünktlich, bleibt fair und meldet Probleme früh in diesem Channel oder bei der Turnierleitung.",
						inline: false,
					},
				],
				footer: { text: "Lauchgruen Community-Turniere · Viel Erfolg und vor allem viel Spaß" },
			},
		],
		components: [
			{
				type: 1,
				components: [linkButton("Captain-Portal", "/captain"), linkButton("Spielplan", "/schedule"), linkButton("Regeln", "/terms")],
			},
		],
	};
}

/** Short post in the team channel when an already published team gets a new captain; pings the team role and the new captain. */
export function teamCaptainChangeMessage(input: { teamName: string; roleId?: string; captainId: string; previousCaptainId: string | null }): DiscordMessagePayload {
	const mentions = [input.roleId ? `<@&${input.roleId}>` : null, `<@${input.captainId}>`].filter(Boolean).join(" ");
	return {
		content: `${mentions} Neuer Captain für ${input.teamName}: <@${input.captainId}>`,
		embeds: [
			{
				title: "👑 Captain-Wechsel",
				description: [
					input.previousCaptainId ? `<@${input.previousCaptainId}> ist nicht mehr Captain. Neuer Captain ist <@${input.captainId}>.` : `<@${input.captainId}> ist euer Captain.`,
					"Der Captain checkt vor jedem Match ein, führt den Champ Select und gibt nach dem Match das Ergebnis im Captain-Portal ab.",
				].join("\n\n"),
				color: 0xb7f36b,
			},
		],
		components: [{ type: 1, components: [linkButton("Captain-Portal", "/captain")] }],
	};
}
