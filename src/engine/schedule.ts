import { addDays, weekday } from "./dates";
import type { Habit, ISODate, Pause, Rules } from "./types";

/** Правила, действующие в дату d: последняя версия с from ≤ d. */
export function rulesAt(habit: Habit, d: ISODate): Rules {
  let current = habit.rules[0].rules;
  for (const v of habit.rules) if (v.from <= d) current = v.rules;
  return current;
}

export function isPaused(pauses: Pause[], habitId: string, d: ISODate) {
  return pauses.some((p) => (p.habitId === null || p.habitId === habitId) && p.start <= d && d <= p.end);
}

/** Плановый ли день для привычки с расписанием по дням недели. */
export function isPlannedDay(habit: Habit, d: ISODate) {
  return habit.schedule.kind === "days" && habit.schedule.days.includes(weekday(d));
}

/** N(T): число плановых выполнений за days дней начиная со start. */
export function plannedCount(habit: Habit, start: ISODate, days: number) {
  const s = habit.schedule;
  if (s.kind === "perWeek") return Math.round((s.times * days) / 7);
  let n = 0;
  for (let i = 0; i < days; i++) if (s.days.includes(weekday(addDays(start, i)))) n++;
  return n;
}

/** P = ⌈C / N(T)⌉, не меньше 1. */
export function paintRate(habit: Habit, start: ISODate, days: number, cells: number) {
  return Math.max(1, Math.ceil(cells / Math.max(1, plannedCount(habit, start, days))));
}
