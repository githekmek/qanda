/**
 * Multiple selections use a JSON array in the existing string answer column.
 * Single-choice indices and free text keep their original storage format.
 * @param {string} value
 * @param {number} optionCount
 * @returns {number[] | null}
 */
export function parseMultipleAnswer(value, optionCount) {
  try {
    const indices = JSON.parse(value);
    if (!Array.isArray(indices) || indices.length < 1 || indices.length > optionCount ||
        indices.some((index) => !Number.isInteger(index) || index < 0 || index >= optionCount) ||
        new Set(indices).size !== indices.length) return null;
    return [...indices].sort((a, b) => a - b);
  } catch {
    return null;
  }
}

/**
 * A ranking is a JSON array listing every option index once, most preferred first.
 * @param {string} value
 * @param {number} optionCount
 * @returns {number[] | null}
 */
export function parseRankingAnswer(value, optionCount) {
  try {
    const order = JSON.parse(value);
    if (!Array.isArray(order) || order.length !== optionCount || optionCount < 1 ||
        order.some((index) => !Number.isInteger(index) || index < 0 || index >= optionCount) ||
        new Set(order).size !== order.length) return null;
    return order;
  } catch {
    return null;
  }
}

/** @param {string} type @param {string} left @param {string} right @param {number} optionCount */
export function answersMatch(type, left, right, optionCount) {
  if (type === "RANKING") {
    const a = parseRankingAnswer(left, optionCount);
    const b = parseRankingAnswer(right, optionCount);
    return a !== null && b !== null && a.every((index, place) => index === b[place]);
  }
  if (type !== "MULTIPLE_SELECT") return left === right;
  const a = parseMultipleAnswer(left, optionCount);
  const b = parseMultipleAnswer(right, optionCount);
  return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}

/** @param {string} type @param {string[] | null} options @param {string | undefined} value
 * @returns {string[]}
 */
export function answerLabels(type, options, value) {
  if (value === undefined) return [];
  if (type === "MULTIPLE_SELECT") {
    return (parseMultipleAnswer(value, options?.length ?? 0) ?? []).map((index) => options?.[index] ?? "");
  }
  if (type === "RANKING") {
    return (parseRankingAnswer(value, options?.length ?? 0) ?? []).map((index) => options?.[index] ?? "");
  }
  if (type === "MULTIPLE_CHOICE" && options) return [options[Number(value)] ?? ""];
  return [value];
}

/** Option positions chosen in one answer; empty for free text or an unreadable value.
 * @param {string} type @param {string | undefined} value @param {number} optionCount
 * @returns {number[]}
 */
export function selectedPositions(type, value, optionCount) {
  if (value === undefined) return [];
  if (type === "MULTIPLE_SELECT") return parseMultipleAnswer(value, optionCount) ?? [];
  if (type === "RANKING") return [...(parseRankingAnswer(value, optionCount) ?? [])].sort((a, b) => a - b);
  if (type === "MULTIPLE_CHOICE") {
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 && index < optionCount ? [index] : [];
  }
  return [];
}

/** Matches option identities, not labels (two options may have the same text).
 * @param {string | undefined} value @param {string | undefined} other @param {number} optionCount
 * @returns {boolean[]}
 */
export function matchingAnswerPositions(value, other, optionCount) {
  const selected = value === undefined ? [] : (parseMultipleAnswer(value, optionCount) ?? []);
  const shared = new Set(other === undefined ? [] : (parseMultipleAnswer(other, optionCount) ?? []));
  return selected.map((index) => shared.has(index));
}

/** For each place in one ranking: does the other ranking put the same option there?
 * @param {string | undefined} value @param {string | undefined} other @param {number} optionCount
 * @returns {boolean[]}
 */
export function samePlaces(value, other, optionCount) {
  const order = value === undefined ? null : parseRankingAnswer(value, optionCount);
  const compare = other === undefined ? null : parseRankingAnswer(other, optionCount);
  return (order ?? []).map((index, place) => compare?.[place] === index);
}
