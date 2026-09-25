import { randomBytes } from "crypto";

// No I, O, 0 or 1 so codes stay unambiguous when typed off a screen or read aloud.
// Exactly 32 characters, which divides 256 evenly and keeps the sampling unbiased.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length: number): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

export function generateAccessCode() {
  return generateCode(8);
}

export function generateInviteCode() {
  return generateCode(12);
}

export { formatAccessCode, normalizeAccessCode } from "./codeFormat";
