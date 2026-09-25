/**
 * @param {string | null | undefined} target
 * @returns {string}
 */
export function safeRedirect(target) {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/";
  const path = target.split(/[?#]/, 1)[0];
  if (/[\\\u0000-\u0020\u007f]/.test(target) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f|25)/i.test(path)) return "/";
  if (/^\/login(?:\/|$)/i.test(path)) return "/";
  return target;
}
