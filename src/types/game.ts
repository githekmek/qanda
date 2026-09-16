export type QuestionType = "MULTIPLE_CHOICE" | "TEXT";

export type PublicQuestion = {
  id: string;
  type: QuestionType;
  text: string;
  options: string[] | null;
  status: "PENDING" | "ANSWERED";
  createdAt: string;
  asker: { id: string; username: string };
  askerAnswer?: string;
  answer?: {
    value: string;
    createdAt: string;
    responder: { id: string; username: string };
  };
  isMatch?: boolean;
};

export type GameStateResponse = {
  me: { id: string; username: string };
  opponent: { id: string; username: string } | null;
  isMyTurnToAsk: boolean;
  awaitingMyAnswer: boolean;
  pendingQuestion: PublicQuestion | null;
  history: PublicQuestion[];
};
