/**
 * Automatic sub check (plan §9). A channel owner connects their Twitch account once with
 * `channel:read:subscriptions`. The site then reads that channel's subscriber list and confirms every
 * open payout whose payer gifted a sub on it. Tokens stay server-side in `winchallenge_sub_channels`
 * and are never sent to a client.
 *
 * Limits: Twitch lists current subs only (gifts drop off after about a month), anonymous gifts carry
 * no gifter, and a gift the payer made on that channel before the end also counts.
 */
import { getDb } from "@/lib/mongo";
import { listTwitchLinksForDiscordIds } from "@/lib/tournament-storage";
import { listParticipants, listPayouts, setPayoutStatus } from "@/lib/winchallenge/store";
import { matchGifts, type TwitchSub } from "@/lib/winchallenge/subs";
import type { WinChallenge, WinParticipant } from "@/lib/winchallenge/types";

const SUB_CHANNELS = "winchallenge_sub_channels";
export const SUB_SCOPE = "channel:read:subscriptions";
export const SUB_CHECK_ACTOR = "Twitch";
const THROTTLE_MS = 15_000;

type SubChannelDoc = {
	_id: string; // Twitch user id
	login: string;
	discordId: string;
	accessToken: string;
	refreshToken: string;
	expiresAt: string;
	connectedAt: string;
	updatedAt: string;
	lastCheckAt?: string;
	lastError?: string | null;
};

/** What clients may see about a connected channel. No tokens. */
export type SubChannelInfo = { login: string; connectedAt: string; lastCheckAt: string | null; lastError: string | null };

export type SubCheckResult = {
	confirmedIds: string[];
	channels: { login: string; state: "ok" | "not-connected" | "skipped" | "error"; error?: string }[];
};

async function channels() {
	return (await getDb()).collection<SubChannelDoc>(SUB_CHANNELS);
}

/** Local test runs can point the Twitch calls at a fake server. Never honoured in production builds. */
function twitchBase(): { api: string; auth: string } {
	const fake = process.env.NODE_ENV !== "production" ? process.env.WINCHALLENGE_FAKE_TWITCH_URL?.trim() : undefined;
	if (fake) return { api: `${fake}/helix`, auth: `${fake}/oauth2` };
	return { api: "https://api.twitch.tv/helix", auth: "https://id.twitch.tv/oauth2" };
}

function clientCredentials() {
	if (twitchBase().api.startsWith("http://")) return { id: "fake-client", secret: "fake-secret" };
	const id = process.env.TWITCH_CLIENT_ID?.trim();
	const secret = process.env.TWITCH_CLIENT_SECRET?.trim();
	if (!id || !secret) throw new Error("TWITCH_CLIENT_ID oder TWITCH_CLIENT_SECRET fehlt.");
	return { id, secret };
}

export async function saveSubChannel(input: {
	twitchUserId: string;
	login: string;
	discordId: string;
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
}): Promise<void> {
	const now = new Date();
	await (
		await channels()
	).updateOne(
		{ _id: input.twitchUserId },
		{
			$set: {
				login: input.login.toLowerCase(),
				discordId: input.discordId,
				accessToken: input.accessToken,
				refreshToken: input.refreshToken,
				expiresAt: new Date(now.getTime() + input.expiresIn * 1000).toISOString(),
				connectedAt: now.toISOString(),
				updatedAt: now.toISOString(),
				lastError: null,
			},
		},
		{ upsert: true }
	);
}

export async function listSubChannels(logins: string[]): Promise<SubChannelInfo[]> {
	if (logins.length === 0) return [];
	const docs = await (await channels()).find({ login: { $in: logins.map((login) => login.toLowerCase()) } }).toArray();
	return docs.map((doc) => ({ login: doc.login, connectedAt: doc.connectedAt, lastCheckAt: doc.lastCheckAt ?? null, lastError: doc.lastError ?? null }));
}

async function refreshToken(doc: SubChannelDoc): Promise<string> {
	const { id, secret } = clientCredentials();
	const response = await fetch(`${twitchBase().auth}/token`, {
		method: "POST",
		body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "refresh_token", refresh_token: doc.refreshToken }),
		cache: "no-store",
	});
	if (!response.ok) throw new Error("Twitch-Verbindung abgelaufen. Bitte Kanal neu verbinden.");
	const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
	if (!json.access_token) throw new Error("Twitch-Verbindung abgelaufen. Bitte Kanal neu verbinden.");
	const now = Date.now();
	doc.accessToken = json.access_token;
	doc.refreshToken = json.refresh_token ?? doc.refreshToken;
	doc.expiresAt = new Date(now + (json.expires_in ?? 3600) * 1000).toISOString();
	await (
		await channels()
	).updateOne({ _id: doc._id }, { $set: { accessToken: doc.accessToken, refreshToken: doc.refreshToken, expiresAt: doc.expiresAt, updatedAt: new Date(now).toISOString() } });
	return doc.accessToken;
}

async function fetchSubs(doc: SubChannelDoc): Promise<TwitchSub[]> {
	const { id } = clientCredentials();
	let token = new Date(doc.expiresAt).getTime() - Date.now() < 60_000 ? await refreshToken(doc) : doc.accessToken;
	let refreshed = false;
	const subs: TwitchSub[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < 50; page++) {
		const params = new URLSearchParams({ broadcaster_id: doc._id, first: "100" });
		if (cursor) params.set("after", cursor);
		const response = await fetch(`${twitchBase().api}/subscriptions?${params}`, {
			headers: { Authorization: `Bearer ${token}`, "Client-Id": id },
			cache: "no-store",
		});
		if (response.status === 401 && !refreshed) {
			refreshed = true;
			token = await refreshToken(doc);
			page--;
			continue;
		}
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { message?: string } | null;
			throw new Error(`Twitch: ${body?.message || `Fehler ${response.status}`}`);
		}
		const json = (await response.json()) as { data?: TwitchSub[]; pagination?: { cursor?: string } };
		subs.push(...(json.data ?? []).map((entry) => ({ user_id: entry.user_id, gifter_id: entry.gifter_id ?? "", is_gift: Boolean(entry.is_gift) })));
		cursor = json.pagination?.cursor;
		if (!cursor || !json.data?.length) break;
	}
	return subs;
}

/** Twitch user ids a payer may have gifted from: the id stored at sign-up and the currently linked one. */
async function payerTwitchIds(participants: WinParticipant[]): Promise<Map<string, Set<string>>> {
	const links = await listTwitchLinksForDiscordIds(participants.map((participant) => participant.discordId)).catch(() => []);
	const byDiscord = new Map(links.map((link) => [link.discordId, link.twitchUserId]));
	return new Map(
		participants.map((participant) => [
			participant.id,
			new Set([participant.twitchId, byDiscord.get(participant.discordId)].filter((value): value is string => Boolean(value))),
		])
	);
}

/**
 * Reads the subscriber lists of connected payout channels and confirms the payouts they prove.
 * Without `force`, a channel checked in the last 15 seconds is skipped.
 */
export async function checkSubs(challenge: WinChallenge, options: { channels?: string[]; force?: boolean } = {}): Promise<SubCheckResult> {
	const only = options.channels?.map((channel) => channel.toLowerCase());
	const payouts = (await listPayouts(challenge.id)).filter((payout) => payout.status !== "confirmed" && (!only || only.includes(payout.channel.toLowerCase())));
	const result: SubCheckResult = { confirmedIds: [], channels: [] };
	if (payouts.length === 0) return result;

	const logins = [...new Set(payouts.map((payout) => payout.channel.toLowerCase()))];
	const docs = new Map((await (await channels()).find({ login: { $in: logins } }).toArray()).map((doc) => [doc.login, doc]));
	const subsByChannel = new Map<string, TwitchSub[]>();
	for (const login of logins) {
		const doc = docs.get(login);
		if (!doc) {
			result.channels.push({ login, state: "not-connected" });
			continue;
		}
		if (!options.force && doc.lastCheckAt && Date.now() - new Date(doc.lastCheckAt).getTime() < THROTTLE_MS) {
			result.channels.push({ login, state: "skipped" });
			continue;
		}
		const lastCheckAt = new Date().toISOString();
		try {
			subsByChannel.set(login, await fetchSubs(doc));
			await (await channels()).updateOne({ _id: doc._id }, { $set: { lastCheckAt, lastError: null } });
			result.channels.push({ login, state: "ok" });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Prüfung fehlgeschlagen.";
			await (await channels()).updateOne({ _id: doc._id }, { $set: { lastCheckAt, lastError: message } });
			result.channels.push({ login, state: "error", error: message });
		}
	}
	if (subsByChannel.size === 0) return result;

	const ids = await payerTwitchIds(await listParticipants(challenge.id));
	for (const payoutId of matchGifts(payouts, ids, subsByChannel)) {
		const updated = await setPayoutStatus({ payoutId, challengeId: challenge.id, status: "confirmed", allowedFrom: ["open", "paid"], actor: SUB_CHECK_ACTOR });
		if (updated) result.confirmedIds.push(payoutId);
	}
	return result;
}
