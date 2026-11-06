// Shared by the browser picker and server validation. Keep this module free of server imports.
export const COMMENT_EMOJIS = [
  "👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🤔",
  "😍", "🥰", "😅", "🤣", "😳", "🙈", "😬", "🙄",
  "😎", "🤯", "🥲", "😡", "🙏", "💯", "🎉", "👀",
] as const;

export type CommentEmoji = (typeof COMMENT_EMOJIS)[number];

export function isCommentEmoji(value: string): value is CommentEmoji {
  return (COMMENT_EMOJIS as readonly string[]).includes(value);
}

/** Identifies one emoji on one comment, e.g. for "new reaction" hints. */
export function emojiKey(commentId: string, emoji: string) {
  return commentId + ":" + emoji;
}
