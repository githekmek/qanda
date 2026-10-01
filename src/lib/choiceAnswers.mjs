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

/** @param {string} type @param {string} left @param {string} right @param {number} optionCount */
export function answersMatch(type, left, right, optionCount) {
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
  if (type === "MULTIPLE_CHOICE" && options) return [options[Number(value)] ?? ""];
  return [value];
}
