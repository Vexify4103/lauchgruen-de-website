import { randomInt } from "node:crypto";

/** No 0/O, 1/I/L, so codes read out on stream or typed from a phone are unambiguous. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;

export function generateJoinCode(random: (max: number) => number = randomInt): string {
	let code = "";
	for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) code += JOIN_CODE_ALPHABET[random(JOIN_CODE_ALPHABET.length)];
	return code;
}

/** Accepts "k7 3q-ab" (any case, spaces, dashes); returns null when it cannot be a code. */
export function normalizeJoinCode(input: string): string | null {
	const code = input.toUpperCase().replace(/[\s-]/g, "");
	if (code.length !== JOIN_CODE_LENGTH) return null;
	return [...code].every((char) => JOIN_CODE_ALPHABET.includes(char)) ? code : null;
}
