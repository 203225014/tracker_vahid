"use client";

import { useSyncExternalStore } from "react";
import { addDays, diffDays } from "@/engine/dates";
import { PRESETS, type Preset } from "@/engine/presets";
import { rulesAt } from "@/engine/schedule";
import type { Cell, Completion, Habit, ISODate, Pause, Picture, Rules } from "@/engine/types";

export interface ActivePicture {
  title: string;
  targetDays: number;
  picture: Picture;
}

export interface CollectedPicture {
  title: string;
  picture: Picture;
  cells: Cell[];
  completedOn: ISODate;
}

export interface GameState {
  version: 1;
  habits: Habit[];
  active: ActivePicture | null;
  completions: Completion[];
  pauses: Pause[];
  collection: CollectedPicture[];
  /** Граница суток (раздел 6) и сдвиг даты для демо-перемотки. */
  settings: { dayStartHour: number; debugOffset: number };
}

const KEY = "pixel-habits:v1";
const EMPTY: GameState = {
  version: 1,
  habits: [],
  active: null,
  completions: [],
  pauses: [],
  collection: [],
  settings: { dayStartHour: 4, debugOffset: 0 },
};

let state: GameState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    // Повреждённое или недоступное хранилище: начинаем с чистого листа.
  }
}

function set(next: GameState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Приватный режим: игра работает до закрытия вкладки.
  }
  listeners.forEach((l) => l());
}

export function useGame(): GameState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (load(), state),
    () => null,
  );
}

/** Сегодняшняя дата с учётом границы суток и демо-сдвига. */
export function today(s: GameState): ISODate {
  const now = new Date(Date.now() - s.settings.dayStartHour * 3_600_000);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return addDays(local, s.settings.debugOffset);
}

export function presetOf(rules: Rules): Preset | "custom" {
  for (const p of Object.keys(PRESETS) as Preset[]) if (JSON.stringify({ ...PRESETS[p], punish: rules.punish }) === JSON.stringify(rules)) return p;
  return "custom";
}

/** Можно ли ещё поставить или снять отметку за дату d (окно дозаполнения). */
export function canEdit(s: GameState, habit: Habit, d: ISODate) {
  const lag = diffDays(today(s), d);
  return lag >= 0 && lag <= rulesAt(habit, d).backfillDays && (!s.active || d >= s.active.picture.startDate);
}

export const actions = {
  startGame(habits: Habit[], active: ActivePicture) {
    set({ ...state, habits, active, completions: [], pauses: [] });
  },
  toggle(habitId: string, date: ISODate) {
    const has = state.completions.some((c) => c.habitId === habitId && c.date === date);
    set({
      ...state,
      completions: has
        ? state.completions.filter((c) => !(c.habitId === habitId && c.date === date))
        : [...state.completions, { habitId, date }],
    });
  },
  /** Новые правила действуют с завтрашнего дня и не меняют прошлое (раздел 5). */
  setRules(habitId: string, rules: Rules) {
    const from = addDays(today(state), 1);
    set({
      ...state,
      habits: state.habits.map((h) =>
        h.id === habitId ? { ...h, rules: [...h.rules.filter((v) => v.from < from), { from, rules }] } : h,
      ),
    });
  },
  /** Пауза ставится только на сегодня и вперёд (раздел 6). */
  addPause(habitId: string | null, days: number) {
    const start = today(state);
    set({ ...state, pauses: [...state.pauses, { habitId, start, end: addDays(start, days - 1) }] });
  },
  collect(cells: Cell[]) {
    if (!state.active) return;
    const done: CollectedPicture = { title: state.active.title, picture: state.active.picture, cells, completedOn: today(state) };
    set({ ...state, active: null, completions: [], pauses: [], collection: [done, ...state.collection] });
  },
  shiftDays(n: number) {
    set({ ...state, settings: { ...state.settings, debugOffset: state.settings.debugOffset + n } });
  },
  reset() {
    set({ ...EMPTY, collection: state.collection });
  },
};
