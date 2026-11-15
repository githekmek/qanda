"use client";

/**
 * Up/down buttons for ranking lists. Buttons at the ends stay focusable but do
 * nothing, so keyboard focus can follow the item it just moved.
 */
export default function MoveButtons({ idPrefix, index, count, label, onMove }: {
  idPrefix: string;
  index: number;
  count: number;
  label: string;
  onMove: (from: number, to: number) => void;
}) {
  function move(direction: "up" | "down") {
    const to = direction === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= count) return;
    onMove(index, to);
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-${direction}-${to}`)?.focus());
  }

  const style = "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-base text-zinc-600 hover:bg-zinc-100 aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-transparent dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";
  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" id={`${idPrefix}-up-${index}`} onClick={() => move("up")}
        aria-disabled={index === 0} aria-label={`${label} nach oben`} className={style}>
        ↑
      </button>
      <button type="button" id={`${idPrefix}-down-${index}`} onClick={() => move("down")}
        aria-disabled={index === count - 1} aria-label={`${label} nach unten`} className={style}>
        ↓
      </button>
    </span>
  );
}
