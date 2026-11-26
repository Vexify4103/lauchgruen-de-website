/** Where a participant receives gifted subs: on their own Twitch channel or on their partner's. */
import type { WinParticipant, WinPayout, WinSubTarget } from "@/lib/winchallenge/types";

type SubFields = Pick<WinParticipant, "id" | "teamId" | "twitchLogin" | "subTarget" | "wishChannel">;

export function partnerOf<T extends SubFields>(participant: SubFields, all: T[]): T | undefined {
	if (!participant.teamId) return undefined;
	return all.find((entry) => entry.teamId === participant.teamId && entry.id !== participant.id);
}

/** Explicit choice wins. Older sign-ups typed a channel name: their partner's name means "partner", anything else "self". */
export function subTargetOf(participant: SubFields, all: SubFields[]): WinSubTarget {
	if (participant.subTarget) return participant.subTarget;
	const partner = partnerOf(participant, all);
	if (participant.wishChannel && partner && participant.wishChannel === partner.twitchLogin.toLowerCase()) return "partner";
	return "self";
}

/** Twitch channel for gifted subs. Falls back to the own channel without a partner, then to `fallback`. */
export function subChannelOf(participant: SubFields, all: SubFields[], fallback: string): string {
	const partner = subTargetOf(participant, all) === "partner" ? partnerOf(participant, all) : undefined;
	return (partner?.twitchLogin || participant.twitchLogin || fallback).toLowerCase();
}

/** One entry of a channel's subscriber list (Twitch "Get Broadcaster Subscriptions"). */
export type TwitchSub = { user_id: string; gifter_id: string; is_gift: boolean };

/**
 * Payouts proven by the subscriber lists. A payout matches a gifted sub on its channel whose gifter is
 * the payer. Each gifted sub proves one payout only. Anonymous gifts and own subs never match.
 */
export function matchGifts(
	payouts: Pick<WinPayout, "id" | "payerId" | "channel" | "status">[],
	payerTwitchIds: Map<string, Set<string>>,
	subsByChannel: Map<string, TwitchSub[]>
): string[] {
	const used = new Set<string>();
	const matched: string[] = [];
	for (const payout of payouts) {
		if (payout.status === "confirmed") continue;
		const channel = payout.channel.toLowerCase();
		const subs = subsByChannel.get(channel);
		const ids = payerTwitchIds.get(payout.payerId);
		if (!subs || !ids?.size) continue;
		const sub = subs.find((entry) => entry.is_gift && entry.gifter_id && ids.has(entry.gifter_id) && !used.has(`${channel}:${entry.user_id}`));
		if (!sub) continue;
		used.add(`${channel}:${sub.user_id}`);
		matched.push(payout.id);
	}
	return matched;
}
