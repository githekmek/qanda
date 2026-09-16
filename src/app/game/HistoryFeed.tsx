import type { PublicQuestion } from "@/types/game";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AnswerRow({
  label,
  text,
  matched,
}: {
  label: string;
  text: string;
  matched?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
      <span>
        <span className="font-medium text-zinc-500">{label}:</span> {text}
      </span>
      {matched !== undefined && (
        <span className={matched ? "text-green-600 dark:text-green-400" : "text-zinc-400"}>
          {matched ? "✓ gleich" : ""}
        </span>
      )}
    </div>
  );
}

export default function HistoryFeed({ history }: { history: PublicQuestion[] }) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Noch keine beantworteten Fragen. Die erste Runde startet, sobald jemand fragt.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {history.map((q) => {
        const askerAnswerText =
          q.type === "MULTIPLE_CHOICE" && q.options && q.askerAnswer !== undefined
            ? q.options[Number(q.askerAnswer)]
            : q.askerAnswer;
        const responderAnswerText =
          q.type === "MULTIPLE_CHOICE" && q.options && q.answer
            ? q.options[Number(q.answer.value)]
            : q.answer?.value;

        return (
          <div
            key={q.id}
            className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-zinc-400">
                {q.type === "MULTIPLE_CHOICE" ? "Multiple Choice" : "Freitext"} · {formatTime(q.createdAt)}
              </span>
            </div>
            <p className="font-medium">
              {q.asker.username} fragt: {q.text}
            </p>
            <div className="flex flex-col gap-1.5">
              <AnswerRow
                label={q.asker.username}
                text={askerAnswerText ?? ""}
                matched={q.isMatch}
              />
              {q.answer && (
                <AnswerRow
                  label={q.answer.responder.username}
                  text={responderAnswerText ?? ""}
                  matched={q.isMatch}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
