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

/** Display form of an access code: ABCD-EFGH. */
export function formatAccessCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts what a person typed (lower case, spaces, dashes) and returns the stored form. */
export function normalizeAccessCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
