export const WISH_GROUP_MODES = ["disabled", "duo", "team"] as const;
export type WishGroupMode = (typeof WISH_GROUP_MODES)[number];

export function normalizeWishGroupMode(value: unknown): WishGroupMode {
	return WISH_GROUP_MODES.includes(value as WishGroupMode) ? (value as WishGroupMode) : "team";
}

export function wishGroupLimit(mode: unknown): number {
	const normalized = normalizeWishGroupMode(mode);
	return normalized === "disabled" ? 0 : normalized === "duo" ? 2 : 5;
}

export function isAllowedPreferenceGroup(mode: unknown, memberCount: number): boolean {
	return memberCount > 0 && memberCount <= wishGroupLimit(mode);
}
