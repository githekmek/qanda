/** Display form of an access code: ABCD-EFGH. */
export function formatAccessCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts what a person typed (lower case, spaces, dashes) and returns the stored form. */
export function normalizeAccessCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
