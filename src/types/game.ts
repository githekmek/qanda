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
  reactions: {
    id: string;
    text: string;
    createdAt: string;
    author: { id: string; username: string };
  }[];
};

export type RoomStateResponse = {
  room: { id: string; name: string | null; archived: boolean; inviteCode: string | null };
  me: { id: string; username: string };
  opponent: { id: string; username: string } | null;
  isMyTurnToAsk: boolean;
  awaitingMyAnswer: boolean;
  pendingQuestion: PublicQuestion | null;
  history: PublicQuestion[];
};

export type RoomSummary = {
  id: string;
  name: string | null;
  createdAt: string;
  archived: boolean;
  opponent: { id: string; username: string } | null;
  inviteCode: string | null;
  lastActivityAt: string;
  awaitingMyAnswer: boolean;
  isMyTurnToAsk: boolean;
  waitingForOpponentAnswer: boolean;
};
