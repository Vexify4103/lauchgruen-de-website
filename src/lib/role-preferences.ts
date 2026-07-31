export function normalizePreferredRoles(roles: string[]) {
	const unique = roles.map((role) => role.trim()).filter(Boolean).filter((role, index, values) => values.findIndex((entry) => entry.toLowerCase() === role.toLowerCase()) === index);
	if (unique.length <= 1) return unique;
	return unique.filter((role) => role.toLowerCase() !== "fill");
}
