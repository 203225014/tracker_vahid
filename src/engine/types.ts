/** Дата в локальном календаре пользователя, формат YYYY-MM-DD. */
export type ISODate = string;

/** Расписание: конкретные дни недели (0 = пн … 6 = вс) или N раз в неделю. */
export type Schedule =
  | { kind: "days"; days: number[] }
  | { kind: "perWeek"; times: number };

/** Правила наказания привычки (раздел 5 документа). */
export interface Rules {
  punish: boolean;
  /** G — льготные пропуски до заражения. */
  grace: number;
  /** r — заражение за пропуск, доля от P. */
  rate: number;
  /** k — действий на очистку одной клетки. */
  cleanseCost: number;
  /** cap — максимум заражения от этой привычки, доля её области. */
  cap: number;
  /** Может ли заражение расти в чужие области. */
  crossSpread: boolean;
  /** Сколько дней после дня можно дозаполнить отметку. */
  backfillDays: number;
  /** Щит за каждые N отметок подряд (0 — щитов нет). */
  shieldEvery: number;
  shieldMax: number;
}

export interface RuleVersion {
  /** С какой даты действуют правила. */
  from: ISODate;
  rules: Rules;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  schedule: Schedule;
  /** Версии правил по возрастанию from. */
  rules: RuleVersion[];
}

export interface Region {
  /** null — фон: нарисован сразу и не заражается. */
  habitId: string | null;
  /** Клетки области в порядке открытия. */
  order: number[];
  /** P — клеток за одну отметку. */
  paintRate: number;
  /** Базовый цвет области (#rrggbb). */
  color: string;
}

export interface Picture {
  width: number;
  height: number;
  seed: number;
  startDate: ISODate;
  /** Индекс области для каждой клетки. */
  regionOf: number[];
  /** Яркость L* исходного пикселя (0–100) для оттенков. */
  shade: number[];
  regions: Region[];
}

export interface Completion {
  habitId: string;
  date: ISODate;
}

export interface Pause {
  /** null — пауза для всех привычек. */
  habitId: string | null;
  start: ISODate;
  end: ISODate;
}

export const Cell = {
  Closed: 0,
  Protected: 1,
  Infected: 2,
  Cleansed: 3,
  Liberated: 4,
} as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

export interface HabitState {
  /** m — пропуски подряд. */
  misses: number;
  shields: number;
  streak: number;
  /** Остаток действий, не хвативший на очистку клетки. */
  carry: number;
  /** Сколько клеток из order уже открыто. */
  opened: number;
}

export interface DayStats {
  date: ISODate;
  painted: number;
  infected: number;
  cleansed: number;
  /** Нарастающим итогом. */
  infectedTotal: number;
  restoredTotal: number;
}

export interface SimInput {
  picture: Picture;
  habits: Habit[];
  completions: Completion[];
  pauses: Pause[];
  today: ISODate;
}

export interface SimResult {
  cells: Cell[];
  /** Индекс привычки-источника заражения, -1 если нет. */
  infectedBy: number[];
  habits: Record<string, HabitState>;
  /** Клетки, которые заразятся, если не отметить привычки сегодня. */
  threatened: number[];
  /**
   * Сколько клеток заразят ещё не закрытые пропуски. Может быть больше threatened:
   * часть будущих заражений сразу снимут уже поставленные отметки, и подсветить их заранее нельзя.
   */
  pendingInfections: number;
  stats: DayStats[];
  progress: { total: number; painted: number; infected: number; cleansed: number };
  completed: boolean;
}
