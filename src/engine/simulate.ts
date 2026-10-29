import { addDays, diffDays, weekday, weekStart } from "./dates";
import { rng } from "./rng";
import { isPaused, isPlannedDay, rulesAt } from "./schedule";
import { Cell, type DayStats, type Habit, type HabitState, type ISODate, type Rules, type SimInput, type SimResult } from "./types";

/**
 * Состояние картины — чистая функция от журнала отметок (раздел 8 документа).
 * Пересчитываем всё с начала картины, поэтому дозаполнение и отмена отметок
 * не требуют особых случаев.
 */
export function simulate(input: SimInput): SimResult {
  const real = run(input, false);
  // «Под угрозой»: что заразится, если все открытые дни закроются без отметок.
  const worst = run(input, true);
  const threatened: number[] = [];
  real.cells.forEach((c, i) => {
    if ((c === Cell.Protected || c === Cell.Liberated) && worst.cells[i] === Cell.Infected) threatened.push(i);
  });
  const total = (r: typeof real) => r.stats.at(-1)?.infectedTotal ?? 0;
  return { ...real, threatened, pendingInfections: total(worst) - total(real) };
}

function run(input: SimInput, closeAll: boolean): Omit<SimResult, "threatened" | "pendingInfections"> {
  const { picture, habits, completions, pauses, today } = input;
  const { width, height, regionOf, regions } = picture;
  const random = rng(picture.seed);

  const cells: Cell[] = regionOf.map((r) => (regions[r].habitId === null ? Cell.Protected : Cell.Closed));
  const infectedBy: number[] = cells.map(() => -1);

  const regionOfHabit = new Map<string, number>();
  regions.forEach((r, i) => r.habitId !== null && regionOfHabit.set(r.habitId, i));
  const active = habits.filter((h) => regionOfHabit.has(h.id));

  const done = new Set(completions.map((c) => `${c.habitId}|${c.date}`));
  const isDone = (h: Habit, d: ISODate) => done.has(`${h.id}|${d}`);

  const states: HabitState[] = active.map(() => ({ misses: 0, shields: 0, streak: 0, carry: 0, opened: 0 }));
  // Журнал заражений каждой привычки: очищаем с конца, то есть самый свежий очаг первым.
  const logs: number[][] = active.map(() => []);
  const infectedCount: number[] = active.map(() => 0);
  const foci: (number[] | null)[] = active.map(() => null);

  const stats: DayStats[] = [];
  let day: DayStats = blankDay(picture.startDate, 0, 0);

  const painted = (c: number) => cells[c] === Cell.Protected || cells[c] === Cell.Liberated;

  function mark(hi: number, rules: Rules) {
    const st = states[hi];
    const region = regions[regionOfHabit.get(active[hi].id)!];
    st.misses = 0;
    st.streak++;
    foci[hi] = null;
    if (rules.shieldEvery > 0 && st.streak % rules.shieldEvery === 0) st.shields = Math.min(rules.shieldMax, st.shields + 1);

    let actions = st.carry + region.paintRate;
    const log = logs[hi];
    // 1. Очистить клетки, заражённые по вине этой привычки.
    while (log.length) {
      const c = log[log.length - 1];
      if (cells[c] !== Cell.Infected || infectedBy[c] !== hi) {
        log.pop();
        continue;
      }
      if (actions < rules.cleanseCost) break;
      cells[c] = Cell.Cleansed;
      infectedBy[c] = -1;
      infectedCount[hi]--;
      log.pop();
      actions -= rules.cleanseCost;
      day.cleansed++;
    }
    if (log.length) {
      st.carry = actions;
      return;
    }
    st.carry = 0;
    // 2. Раскрасить очищенные клетки своей области.
    for (let i = 0; i < st.opened && actions > 0; i++) {
      const c = region.order[i];
      if (cells[c] === Cell.Cleansed) {
        cells[c] = Cell.Liberated;
        actions--;
        day.restoredTotal++;
      }
    }
    // 3. Открыть новые клетки.
    while (actions > 0 && st.opened < region.order.length) {
      cells[region.order[st.opened++]] = Cell.Protected;
      actions--;
      day.painted++;
    }
  }

  function miss(hi: number, rules: Rules) {
    if (!rules.punish) return;
    const st = states[hi];
    if (st.shields > 0) {
      st.shields--;
      return;
    }
    st.misses++;
    st.streak = 0;
    if (st.misses <= rules.grace) return;
    const ri = regionOfHabit.get(active[hi].id)!;
    infect(hi, ri, Math.ceil(rules.rate * regions[ri].paintRate), rules);
  }

  function infect(hi: number, ri: number, count: number, rules: Rules) {
    const region = regions[ri];
    const eligible = (c: number) =>
      painted(c) && (regionOf[c] === ri || (rules.crossSpread && regions[regionOf[c]].habitId !== null));
    let budget = Math.min(count, Math.floor(rules.cap * region.order.length) - infectedCount[hi]);
    while (budget > 0) {
      const focus = foci[hi];
      const frontier: number[] = [];
      if (focus) {
        const seen = new Set<number>();
        for (const c of focus)
          for (const nb of neighbours(c, width, height))
            if (!seen.has(nb) && eligible(nb)) {
              seen.add(nb);
              frontier.push(nb);
            }
      }
      let target: number;
      if (frontier.length) {
        target = frontier[random.int(frontier.length)];
      } else {
        // Новый очаг: случайная раскрашенная клетка своей области.
        const candidates = region.order.slice(0, states[hi].opened).filter(painted);
        if (!candidates.length) break;
        target = candidates[random.int(candidates.length)];
        foci[hi] = [];
      }
      cells[target] = Cell.Infected;
      infectedBy[target] = hi;
      infectedCount[hi]++;
      logs[hi].push(target);
      foci[hi]!.push(target);
      day.infected++;
      day.infectedTotal++;
      budget--;
    }
  }

  for (let d = picture.startDate; d <= today; d = addDays(d, 1)) {
    day = blankDay(d, day.infectedTotal, day.restoredTotal);
    active.forEach((h, hi) => isDone(h, d) && mark(hi, rulesAt(h, d)));
    active.forEach((h, hi) => {
      const rules = rulesAt(h, d);
      const closed = closeAll || diffDays(today, d) > rules.backfillDays;
      if (!closed) return;
      if (h.schedule.kind === "days") {
        if (isPlannedDay(h, d) && !isDone(h, d) && !isPaused(pauses, h.id, d)) miss(hi, rules);
      } else if (weekday(d) === 6) {
        // «N раз в неделю» считается при закрытии воскресенья.
        let marks = 0;
        let open = 0;
        for (let w = weekStart(d); w <= d; w = addDays(w, 1)) {
          if (w < picture.startDate) continue;
          if (isDone(h, w)) marks++;
          if (!isPaused(pauses, h.id, w)) open++;
        }
        const required = Math.ceil((h.schedule.times * open) / 7);
        for (let i = marks; i < required; i++) miss(hi, rules);
      }
    });
    stats.push(day);
  }

  const habitStates: Record<string, HabitState> = {};
  active.forEach((h, hi) => (habitStates[h.id] = states[hi]));

  const progress = { total: 0, painted: 0, infected: 0, cleansed: 0 };
  let completed = true;
  cells.forEach((c, i) => {
    const owner = regions[regionOf[i]].habitId;
    if (owner === null) return;
    progress.total++;
    if (c === Cell.Protected || c === Cell.Liberated) progress.painted++;
    else if (c === Cell.Infected) progress.infected++;
    else if (c === Cell.Cleansed) progress.cleansed++;
    // Область архивной привычки заморожена и не мешает завершению.
    if (regionOfHabit.has(owner) && active.some((h) => h.id === owner) && !(c === Cell.Protected || c === Cell.Liberated))
      completed = false;
  });

  return { cells, infectedBy, habits: habitStates, stats, progress, completed };
}

function blankDay(date: ISODate, infectedTotal: number, restoredTotal: number): DayStats {
  return { date, painted: 0, infected: 0, cleansed: 0, infectedTotal, restoredTotal };
}

function neighbours(c: number, w: number, h: number) {
  const x = c % w;
  const y = (c - x) / w;
  const out: number[] = [];
  if (y > 0) out.push(c - w);
  if (x < w - 1) out.push(c + 1);
  if (y < h - 1) out.push(c + w);
  if (x > 0) out.push(c - 1);
  return out;
}
