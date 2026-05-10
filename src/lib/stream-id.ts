import { randomBytes } from "node:crypto";

export function generateStreamId(): string {
  return "qd_" + randomBytes(8).toString("hex");
}

export function generateGameId(): string {
  // 6-char base32-ish room code; readable for "type to join"
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
