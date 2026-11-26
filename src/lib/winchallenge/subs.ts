/** Where a participant receives gifted subs: on their own Twitch channel or on their partner's. */
import type { WinParticipant, WinSubTarget } from "@/lib/winchallenge/types";

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
