import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { PRESETS } from "./presets";
import { simulate } from "./simulate";
import { Cell, type Completion, type Habit, type Picture, type Rules, type SimInput } from "./types";

const START = "2026-01-05"; // понедельник

function habit(id: string, rules: Partial<Rules> = {}, schedule: Habit["schedule"] = { kind: "days", days: [0, 1, 2, 3, 4, 5, 6] }): Habit {
  return { id, name: id, color: "#ff0000", schedule, rules: [{ from: START, rules: { ...PRESETS.normal, shieldEvery: 0, ...rules } }] };
}

/** Картина w×h: левая половина — привычка a, правая — b (если есть). */
function picture(w: number, h: number, ids: string[], rate = 10): Picture {
  const regionOf = Array.from({ length: w * h }, (_, i) => (ids.length === 2 && i % w >= w / 2 ? 1 : 0));
  const regions = ids.map((id, ri) => ({
    habitId: id,
    color: "#ff0000",
    paintRate: rate,
    order: regionOf.map((r, i) => (r === ri ? i : -1)).filter((i) => i >= 0),
  }));
  return { width: w, height: h, seed: 42, startDate: START, regionOf, shade: regionOf.map(() => 50), regions };
}

const day = (n: number) => addDays(START, n - 1);
const marks = (id: string, days: number[]): Completion[] => days.map((n) => ({ habitId: id, date: day(n) }));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const count = (cells: Cell[], s: Cell) => cells.filter((c) => c === s).length;

describe("пример из раздела 4 документа", () => {
  // 10 дней отметок → 100 клеток, затем пропуски 11–13 и отметки 14–20.
  const base: SimInput = {
    picture: picture(20, 20, ["a"]),
    habits: [habit("a")],
    completions: marks("a", [...range(1, 10), ...range(14, 20)]),
    pauses: [],
    today: day(22),
  };
  const r = simulate(base);
  const row = (n: number) => r.stats[n - 1];

  it("первый пропуск льготный", () => {
    expect(row(11).infected).toBe(0);
  });
  it("второй и третий пропуски заражают по P = 10 клеток", () => {
    expect(row(12).infected).toBe(10);
    expect(row(13).infected).toBe(10);
  });
  it("две отметки очищают, две раскрашивают, пятая открывает новые", () => {
    expect([row(14).cleansed, row(15).cleansed]).toEqual([10, 10]);
    expect(row(17).restoredTotal).toBe(20);
    expect(row(18).painted).toBe(10);
  });
  it("итог: 130 клеток раскрашено, заражённых нет", () => {
    expect(r.progress).toMatchObject({ painted: 130, infected: 0, cleansed: 0 });
    expect(count(r.cells, Cell.Liberated)).toBe(20);
  });
  it("результат детерминирован", () => {
    expect(simulate(base).cells).toEqual(r.cells);
  });
});

describe("справедливость", () => {
  it("неплановые дни не наказываются", () => {
    const h = habit("a", { grace: 0 }, { kind: "days", days: [0] }); // только понедельник
    const r = simulate({ picture: picture(10, 10, ["a"]), habits: [h], completions: marks("a", [1]), pauses: [], today: day(7) });
    expect(r.progress.infected).toBe(0);
  });

  it("пауза отменяет пропуски", () => {
    const r = simulate({
      picture: picture(10, 10, ["a"]),
      habits: [habit("a", { grace: 0 })],
      completions: marks("a", [1, 2, 3]),
      pauses: [{ habitId: null, start: day(4), end: day(8) }],
      today: day(10),
    });
    expect(r.progress.infected).toBe(0);
  });

  it("щит поглощает пропуск", () => {
    const r = simulate({
      picture: picture(10, 10, ["a"], 2),
      habits: [habit("a", { grace: 0, shieldEvery: 3, shieldMax: 1 })],
      completions: marks("a", [1, 2, 3]),
      pauses: [],
      today: day(7),
    });
    expect(r.stats[3].infected).toBe(0);
    expect(r.stats[4].infected).toBe(2);
  });

  it("день в окне дозаполнения ещё не наказан, но клетки под угрозой", () => {
    const r = simulate({
      picture: picture(10, 10, ["a"]),
      habits: [habit("a", { grace: 0, backfillDays: 1 })],
      completions: marks("a", [1, 2, 3]),
      pauses: [],
      today: day(4),
    });
    expect(r.progress.infected).toBe(0);
    expect(r.threatened).toHaveLength(10);
  });

  it("незакрытый вчерашний пропуск учитывается, даже если сегодняшняя отметка его сразу снимет", () => {
    const r = simulate({
      picture: picture(10, 10, ["a"]),
      habits: [habit("a", { grace: 0, backfillDays: 1 })],
      completions: marks("a", [1, 2, 3, 5]),
      pauses: [],
      today: day(5),
    });
    expect(r.threatened).toHaveLength(0);
    expect(r.pendingInfections).toBe(10);
  });

  it("заражение не превышает cap и трогает только раскрашенное", () => {
    const r = simulate({
      picture: picture(10, 10, ["a"]),
      habits: [habit("a", { grace: 0, cap: 0.25, rate: 3 })],
      completions: marks("a", [1, 2, 3, 4]),
      pauses: [],
      today: day(30),
    });
    expect(r.progress.infected).toBe(25);
  });

  it("без наказания пропуски ничего не делают", () => {
    const r = simulate({ picture: picture(10, 10, ["a"]), habits: [habit("a", { punish: false })], completions: marks("a", [1]), pauses: [], today: day(30) });
    expect(r.progress.infected).toBe(0);
  });
});

describe("расписание N раз в неделю", () => {
  it("недобор считается при закрытии воскресенья", () => {
    const h = habit("a", { grace: 0 }, { kind: "perWeek", times: 3 });
    const r = simulate({ picture: picture(10, 10, ["a"], 5), habits: [h], completions: marks("a", [1, 3, 5, 8]), pauses: [], today: day(16) });
    // неделя 1: 3 из 3, неделя 2: 1 из 3 → 2 пропуска по 5 клеток
    expect(r.stats[6].infected).toBe(0);
    expect(r.stats[13].infected).toBe(10);
  });
});

describe("очаги и чужие области", () => {
  it("очаг растёт по соседям", () => {
    const r = simulate({ picture: picture(10, 10, ["a"]), habits: [habit("a", { grace: 0 })], completions: marks("a", range(1, 8)), pauses: [], today: day(11) });
    const infected = r.cells.map((c, i) => (c === Cell.Infected ? i : -1)).filter((i) => i >= 0);
    const touches = (i: number) => infected.some((j) => j !== i && (Math.abs(i - j) === 10 || (Math.abs(i - j) === 1 && Math.floor(i / 10) === Math.floor(j / 10))));
    expect(infected.length).toBeGreaterThan(1);
    expect(infected.every(touches)).toBe(true);
  });

  it("кто заразил, тот и лечит; чья клетка, та и красит", () => {
    const pic = picture(4, 4, ["a", "b"], 8);
    const a = habit("a", { grace: 0, crossSpread: true, cap: 1, rate: 2 });
    const b = habit("b", { grace: 0 });
    const both = (n: number[]) => [...marks("a", n), ...marks("b", n)];
    // день 1 обе раскрашивают всё, день 2 пропускает только a: заражение уходит и в область b
    const sick = simulate({ picture: pic, habits: [a, b], completions: [...both([1]), ...marks("b", [2])], pauses: [], today: day(4) });
    const inB = sick.cells.filter((c, i) => c === Cell.Infected && pic.regionOf[i] === 1).length;
    expect(inB).toBeGreaterThan(0);
    const healed = simulate({
      picture: pic,
      habits: [a, { ...b, rules: [{ from: START, rules: { ...b.rules[0].rules, punish: false } }] }],
      completions: [...both([1]), ...marks("b", [2, 3, 4, 5]), ...marks("a", [3, 4, 5])],
      pauses: [],
      today: day(5),
    });
    expect(healed.progress.infected).toBe(0);
    expect(healed.completed).toBe(true);
  });
});
