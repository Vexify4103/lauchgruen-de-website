const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_ROLE_MAX_ATTEMPTS = 5;
const DISCORD_NICKNAME_MAX_ATTEMPTS = 5;
const DISCORD_MEMBER_MAX_ATTEMPTS = 5;

let discordRoleMutationQueue: Promise<void> = Promise.resolve();
let discordNicknameMutationQueue: Promise<void> = Promise.resolve();

export const DISCORD_INVITE_URL = "https://discord.gg/GFYv7K3SKb";

function discordBotToken() {
	return process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "";
}

function discordGuildId() {
	return process.env.DISCORD_GUILD_ID ?? "";
}

type DiscordMember = {
	nick?: string | null;
	roles?: string[];
};

export type DiscordRoleCheck =
	| { status: "missing-config"; message: string }
	| { status: "missing-member"; message: string }
	| { status: "missing-role"; message: string }
	| { status: "synced"; message: string }
	| { status: "error"; message: string };

export function formatTournamentNickname(displayName: string, riotId: string) {
	const name = displayName.trim() || riotId.split("#")[0] || "Player";
	const separator = " | ";
	const availableNameLength = Math.max(1, 32 - separator.length - riotId.length);
	return `${name.slice(0, availableNameLength)}${separator}${riotId}`.slice(0, 32);
}

export async function isDiscordGuildMember(discordId: string): Promise<boolean | null> {
	const token = discordBotToken();
	const guildId = discordGuildId();
	if (!token || !guildId) return null;

	const response = await fetchDiscordGuildMemberResponse(discordId, token, guildId);

	if (!response) return null;
	if (response.status === 404) return false;
	if (!response.ok) return null;
	return true;
}

async function getDiscordGuildMember(discordId: string): Promise<DiscordMember | null | "missing-config" | "missing-member" | "error"> {
	const token = discordBotToken();
	const guildId = discordGuildId();
	if (!token || !guildId) return "missing-config";

	const response = await fetchDiscordGuildMemberResponse(discordId, token, guildId);

	if (!response) return "error";
	if (response.status === 404) return "missing-member";
	if (!response.ok) return "error";
	return (await response.json().catch(() => null)) as DiscordMember | null;
}

async function fetchDiscordGuildMemberResponse(discordId: string, token: string, guildId: string): Promise<Response | null> {
	for (let attempt = 1; attempt <= DISCORD_MEMBER_MAX_ATTEMPTS; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}`, {
				headers: { authorization: `Bot ${token}` },
				cache: "no-store",
			});
		} catch {
			if (attempt === DISCORD_MEMBER_MAX_ATTEMPTS) return null;
			await wait(250 * attempt);
			continue;
		}

		if (response.status === 429 && attempt < DISCORD_MEMBER_MAX_ATTEMPTS) {
			const body = (await response.clone().json().catch(() => null)) as { retry_after?: number } | null;
			const retryAfterSeconds =
				body?.retry_after ?? parseRetryAfter(response.headers.get("retry-after")) ?? parseRetryAfter(response.headers.get("x-ratelimit-reset-after")) ?? 1;
			await wait(Math.ceil(retryAfterSeconds * 1000) + 150);
			continue;
		}

		return response;
	}

	return null;
}

export async function checkDiscordMemberRole(input: { discordId: string; roleId?: string }): Promise<DiscordRoleCheck> {
	const roleId = input.roleId?.trim();
	if (!roleId) {
		return {
			status: "missing-config",
			message: "DISCORD_CAPTAINS_ROLE_ID fehlt.",
		};
	}

	const member = await getDiscordGuildMember(input.discordId);
	if (member === "missing-config") {
		return {
			status: "missing-config",
			message: "Discord Bot Token oder Guild ID fehlt.",
		};
	}
	if (member === "missing-member") {
		return {
			status: "missing-member",
			message: "User ist nicht auf dem Discord.",
		};
	}
	if (member === "error" || !member) {
		return {
			status: "error",
			message: "Discord Member konnte nicht gelesen werden.",
		};
	}
	if (!member.roles?.includes(roleId)) {
		return {
			status: "missing-role",
			message: "Captain-Rolle fehlt.",
		};
	}
	return {
		status: "synced",
		message: "Captain-Rolle synchronisiert.",
	};
}

type DiscordNicknameResult = { ok: true; changed: boolean } | { ok: false; message: string };

export async function setDiscordNickname(input: { discordId: string; displayName: string; riotId: string }): Promise<DiscordNicknameResult> {
	const run = discordNicknameMutationQueue.then(
		() => setDiscordNicknameWithRetry(input),
		() => setDiscordNicknameWithRetry(input)
	);
	discordNicknameMutationQueue = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

async function setDiscordNicknameWithRetry(input: { discordId: string; displayName: string; riotId: string }): Promise<DiscordNicknameResult> {
	const token = discordBotToken();
	const guildId = discordGuildId();
	if (!token || !guildId) {
		return { ok: false, message: "Discord-Nickname-Sync übersprungen: Bot-Token oder Guild-ID fehlt." };
	}

	const nickname = formatTournamentNickname(input.displayName, input.riotId);
	const member = await getDiscordGuildMember(input.discordId);
	if (member === "missing-config") {
		return { ok: false, message: "Discord-Nickname-Sync übersprungen: Bot-Token oder Guild-ID fehlt." };
	}
	if (member === "missing-member") {
		return { ok: false, message: "Discord-Mitglied wurde auf dem Server nicht gefunden." };
	}
	if (member === "error" || !member) {
		return { ok: false, message: "Discord-Mitglied konnte vor dem Nickname-Sync nicht gelesen werden." };
	}
	if (member.nick === nickname) {
		return { ok: true, changed: false };
	}

	for (let attempt = 1; attempt <= DISCORD_NICKNAME_MAX_ATTEMPTS; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${input.discordId}`, {
				method: "PATCH",
				headers: {
					authorization: `Bot ${token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ nick: nickname }),
			});
		} catch {
			if (attempt === DISCORD_NICKNAME_MAX_ATTEMPTS) {
				return { ok: false, message: "Discord-Nickname konnte wegen eines Netzwerkfehlers nicht geändert werden." };
			}
			await wait(300 * attempt);
			continue;
		}

		if (response.ok) {
			await wait(250);
			return { ok: true, changed: true };
		}

		if (response.status === 429 && attempt < DISCORD_NICKNAME_MAX_ATTEMPTS) {
			const body = (await response.json().catch(() => null)) as { retry_after?: number } | null;
			const retryAfterSeconds =
				body?.retry_after ?? parseRetryAfter(response.headers.get("retry-after")) ?? parseRetryAfter(response.headers.get("x-ratelimit-reset-after")) ?? 1;
			await wait(Math.ceil(retryAfterSeconds * 1000) + 250);
			continue;
		}

		if (response.status === 404) {
			return { ok: false, message: "Discord-Mitglied wurde auf dem Server nicht gefunden." };
		}

		if (response.status === 403) {
			return {
				ok: false,
				message: "Discord-Nickname konnte nicht geändert werden (HTTP 403). Prüfe „Nicknames verwalten“ und ob die Bot-Rolle über den Rollen der Spieler steht.",
			};
		}

		const detail = await response.text().catch(() => "");
		return {
			ok: false,
			message: `Discord-Nickname konnte nicht geändert werden (HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}).`,
		};
	}

	return { ok: false, message: "Discord-Nickname konnte nach mehreren Versuchen nicht geändert werden." };
}

export async function setDiscordMemberRole(input: { discordId: string; roleId: string; enabled: boolean }): Promise<{ ok: true } | { ok: false; message: string }> {
	const run = discordRoleMutationQueue.then(
		() => setDiscordMemberRoleWithRetry(input),
		() => setDiscordMemberRoleWithRetry(input)
	);
	discordRoleMutationQueue = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

async function setDiscordMemberRoleWithRetry(input: { discordId: string; roleId: string; enabled: boolean }): Promise<{ ok: true } | { ok: false; message: string }> {
	const token = discordBotToken();
	const guildId = discordGuildId();
	if (!token || !guildId) {
		return { ok: false, message: "Discord role sync skipped: bot token or guild ID missing." };
	}

	for (let attempt = 1; attempt <= DISCORD_ROLE_MAX_ATTEMPTS; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${input.discordId}/roles/${input.roleId}`, {
				method: input.enabled ? "PUT" : "DELETE",
				headers: { authorization: `Bot ${token}` },
				cache: "no-store",
			});
		} catch {
			if (attempt === DISCORD_ROLE_MAX_ATTEMPTS) {
				return {
					ok: false,
					message: `Discord-Rolle konnte für ${input.discordId} wegen eines Netzwerkfehlers nicht ${input.enabled ? "vergeben" : "entfernt"} werden.`,
				};
			}
			await wait(250 * attempt);
			continue;
		}

		if (response.ok) return { ok: true };

		if (response.status === 429 && attempt < DISCORD_ROLE_MAX_ATTEMPTS) {
			const body = (await response.json().catch(() => null)) as { retry_after?: number } | null;
			const retryAfterSeconds =
				body?.retry_after ?? parseRetryAfter(response.headers.get("retry-after")) ?? parseRetryAfter(response.headers.get("x-ratelimit-reset-after")) ?? 1;
			await wait(Math.ceil(retryAfterSeconds * 1000) + 100);
			continue;
		}

		return {
			ok: false,
			message: `Discord-Rolle konnte für ${input.discordId} nicht ${input.enabled ? "vergeben" : "entfernt"} werden (HTTP ${response.status}). Prüfe „Rollen verwalten“ und die Rollen-Hierarchie.`,
		};
	}

	return {
		ok: false,
		message: `Discord-Rolle konnte für ${input.discordId} nach mehreren Versuchen nicht ${input.enabled ? "vergeben" : "entfernt"} werden.`,
	};
}

function parseRetryAfter(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function wait(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
