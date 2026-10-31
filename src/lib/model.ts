export const CRITERIA = [
  {
    id: "usability",
    name: "Юзабилити приложения",
    description: "Насколько понятно и удобно пользоваться приложением",
    weight: 3,
  },
  {
    id: "features",
    name: "Необычные фичи",
    description: "Оригинальные функции и неожиданные решения",
    weight: 3,
  },
  {
    id: "design",
    name: "Дизайн",
    description: "Визуальная целостность и внимание к деталям",
    weight: 2,
  },
  {
    id: "speaking",
    name: "Качество выступления",
    description: "Подача, ясность и уверенность спикера",
    weight: 2,
  },
  {
    id: "idea",
    name: "Интересность идеи",
    description: "Актуальность задачи и ценность предложенного решения",
    weight: 1,
  },
  {
    id: "presentation",
    name: "Качество презентации",
    description: "Структура, наглядность и содержание слайдов",
    weight: 1,
  },
] as const;

export type Role = "participant" | "jury";
export type EventStatus = "draft" | "open" | "completed";
export type Member = {
  id: string;
  event_id: string;
  name: string;
  role: Role;
  position: number;
};
export type Event = {
  id: string;
  title: string;
  status: EventStatus;
  created_at: string;
};
export type OwnBallot = {
  target_id: string;
  scores: number[];
  weighted_total: number;
};
export type Result = {
  id: string;
  name: string;
  jury: number;
  peers: number;
  total: number;
  rank: number;
};
export type Dashboard = {
  event: Event;
  viewer: Member;
  members: Member[];
  ballots: OwnBallot[];
  submitted: number | null;
  results: Result[] | null;
};
export type AccessCode = { id: string; name: string; role: Role; code: string };
export type ActionResult = {
  error?: string;
  ok?: boolean;
  codes?: AccessCode[];
};

export function validScores(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === CRITERIA.length &&
    Array.from(value).every((n) => Number.isInteger(n) && n >= 1 && n <= 5)
  );
}
export function weightedScore(scores: number[]): number {
  if (!validScores(scores))
    throw new Error("Заполните все шесть критериев целыми числами от 1 до 5.");
  return scores.reduce((sum, n, i) => sum + n * CRITERIA[i].weight, 0);
}
export const formatScore = (n: number) =>
  n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
