"use client";

import { useMemo, useState } from "react";
import { addDays, diffDays, weekStart } from "@/engine/dates";
import { PRESET_LABELS, PRESETS, type Preset } from "@/engine/presets";
import { isPaused, isPlannedDay, rulesAt } from "@/engine/schedule";
import { simulate } from "@/engine/simulate";
import type { Habit, SimResult } from "@/engine/types";
import { actions, canEdit, presetOf, today, useGame, type GameState } from "@/lib/store";
import { Onboarding } from "./Onboarding";
import { PictureCanvas } from "./PictureCanvas";

type Tab = "today" | "habits" | "stats" | "collection";
const TABS: [Tab, string][] = [
  ["today", "Сегодня"],
  ["habits", "Привычки"],
  ["stats", "Статистика"],
  ["collection", "Коллекция"],
];

export function GameApp() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("today");
  if (!game) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 rounded-xl bg-neutral-100 p-1 text-sm dark:bg-neutral-900">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-2 py-2 ${tab === id ? "bg-white shadow-sm dark:bg-neutral-800" : "text-neutral-500"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "collection" ? <CollectionView game={game} /> : !game.active ? <Onboarding game={game} /> : <ActiveGame game={game} tab={tab} />}
      <DemoClock game={game} />
    </div>
  );
}

function ActiveGame({ game, tab }: { game: GameState; tab: Tab }) {
  const t = today(game);
  const active = game.active!;
  const result = useMemo(
    () => simulate({ picture: active.picture, habits: game.habits, completions: game.completions, pauses: game.pauses, today: t }),
    [active.picture, game.habits, game.completions, game.pauses, t],
  );
  if (tab === "habits") return <HabitsView game={game} result={result} />;
  if (tab === "stats") return <StatsView game={game} result={result} />;
  return <TodayView game={game} result={result} />;
}

function TodayView({ game, result }: { game: GameState; result: SimResult }) {
  const t = today(game);
  const active = game.active!;
  const { progress } = result;
  const pct = Math.round((progress.painted / Math.max(1, progress.total)) * 100);
  const day = diffDays(t, active.picture.startDate) + 1;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{active.title}</h2>
        <span className="text-sm text-neutral-500">
          день {day} из {active.targetDays}
        </span>
      </div>
      <PictureCanvas picture={active.picture} cells={result.cells} threatened={result.threatened} className="rounded-lg border border-neutral-200 dark:border-neutral-800" />
      <div className="h-2 rounded-full bg-neutral-200 overflow-hidden dark:bg-neutral-800">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-neutral-500">
        Раскрашено {pct}% · заражено {progress.infected} · ждут раскраски {progress.cleansed}
      </p>
      {result.pendingInfections > 0 && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Пропущенные отметки заразят ещё {result.pendingInfections} клеток
          {result.threatened.length > 0 ? " (мигают жёлтой рамкой)" : ""}. Отметьте привычки сегодня или нажмите «Сделал вчера», если уже сделали.
        </p>
      )}
      {result.completed && (
        <div className="rounded-lg bg-emerald-50 p-4 space-y-2 dark:bg-emerald-950">
          <p className="font-semibold">Картина завершена!</p>
          <button className="rounded-lg bg-emerald-600 px-4 py-2 text-white" onClick={() => actions.collect(result.cells)}>
            В коллекцию и выбрать новую
          </button>
        </div>
      )}
      <div className="space-y-2">
        {game.habits.map((h) => (
          <HabitCard key={h.id} game={game} habit={h} result={result} />
        ))}
      </div>
    </section>
  );
}

function HabitCard({ game, habit, result }: { game: GameState; habit: Habit; result: SimResult }) {
  const t = today(game);
  const yesterday = addDays(t, -1);
  const st = result.habits[habit.id];
  const rules = rulesAt(habit, t);
  const done = (d: string) => game.completions.some((c) => c.habitId === habit.id && c.date === d);
  const paused = isPaused(game.pauses, habit.id, t);

  let plan: string;
  if (paused) plan = "на паузе";
  else if (habit.schedule.kind === "days") plan = isPlannedDay(habit, t) ? "сегодня по плану" : "сегодня выходной";
  else {
    const from = weekStart(t);
    const n = game.completions.filter((c) => c.habitId === habit.id && c.date >= from && c.date <= t).length;
    plan = `${n} из ${habit.schedule.times} на этой неделе`;
  }

  const showYesterday = canEdit(game, habit, yesterday) && !done(yesterday) && (habit.schedule.kind === "perWeek" || isPlannedDay(habit, yesterday));

  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: habit.color }} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{habit.name}</p>
        <p className="text-xs text-neutral-500">
          {plan}
          {rules.punish && st && st.misses > 0 && ` · пропусков подряд ${st.misses} (льготных ${rules.grace})`}
          {st && st.shields > 0 && ` · щитов ${st.shields}`}
        </p>
      </div>
      {showYesterday && (
        <button className="rounded-lg border border-neutral-300 px-3 py-2 text-xs dark:border-neutral-700" onClick={() => actions.toggle(habit.id, yesterday)}>
          Сделал вчера
        </button>
      )}
      <button
        onClick={() => actions.toggle(habit.id, t)}
        className={`rounded-lg px-4 py-2 text-sm ${done(t) ? "bg-emerald-600 text-white" : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"}`}
      >
        {done(t) ? "Готово ✓" : "Выполнено"}
      </button>
    </div>
  );
}

function HabitsView({ game, result }: { game: GameState; result: SimResult }) {
  const t = today(game);
  return (
    <section className="space-y-4">
      <p className="text-sm text-neutral-500">Изменения правил действуют с завтрашнего дня и не меняют прошлое.</p>
      {game.habits.map((h) => {
        const next = h.rules[h.rules.length - 1].rules;
        const preset = presetOf(next);
        const region = game.active!.picture.regions.find((r) => r.habitId === h.id);
        return (
          <div key={h.id} className="rounded-xl border border-neutral-200 p-4 space-y-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 rounded" style={{ background: h.color }} />
              <span className="font-medium flex-1">{h.name}</span>
              <span className="text-xs text-neutral-500">
                {region?.order.length} клеток · {region?.paintRate} за отметку
              </span>
            </div>
            <div className="flex flex-wrap gap-3 items-center text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={next.punish} onChange={(e) => actions.setRules(h.id, { ...next, punish: e.target.checked })} />
                Заражение
              </label>
              <select
                disabled={!next.punish}
                className="rounded-lg border border-neutral-300 px-2 py-1 bg-transparent disabled:opacity-40 dark:border-neutral-700"
                value={preset}
                onChange={(e) => actions.setRules(h.id, { ...PRESETS[e.target.value as Preset], punish: next.punish })}
              >
                {(Object.keys(PRESETS) as Preset[]).map((p) => (
                  <option key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </option>
                ))}
                {preset === "custom" && <option value="custom">Свой</option>}
              </select>
              <span className="text-xs text-neutral-500">
                льгота {next.grace} · заражение {next.rate}×P · очистка {next.cleanseCost} · потолок {Math.round(next.cap * 100)}%
              </span>
            </div>
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <span className="text-neutral-500">Пауза:</span>
              {[1, 3, 7].map((d) => (
                <button key={d} className="rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800" onClick={() => actions.addPause(h.id, d)}>
                  {d} дн.
                </button>
              ))}
              {isPaused(game.pauses, h.id, t) && <span className="text-amber-600">на паузе сегодня</span>}
              {result.habits[h.id]?.carry > 0 && <span className="text-neutral-500">остаток действий {result.habits[h.id].carry}</span>}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 text-sm">
        <button className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700" onClick={() => actions.addPause(null, 7)}>
          Отпуск: пауза всех привычек на 7 дней
        </button>
        <button
          className="rounded-lg border border-red-300 px-3 py-2 text-red-600"
          onClick={() => confirm("Удалить привычки и текущую картину? Коллекция сохранится.") && actions.reset()}
        >
          Начать заново
        </button>
      </div>
    </section>
  );
}

function StatsView({ game, result }: { game: GameState; result: SimResult }) {
  const t = today(game);
  const last = result.stats.slice(-30);
  const peak = Math.max(1, ...last.map((d) => Math.max(d.painted, d.infected)));
  const totals = result.stats.at(-1);
  const start = game.active!.picture.startDate;

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[
          ["Раскрашено", `${Math.round((result.progress.painted / Math.max(1, result.progress.total)) * 100)}%`],
          ["Заражено сейчас", result.progress.infected],
          ["Заражений всего", totals?.infectedTotal ?? 0],
          ["Восстановлено", totals?.restoredTotal ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-neutral-100 p-3 dark:bg-neutral-900">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-sm font-medium mb-2">По дням: открыто клеток (зелёный) и заражено (фиолетовый)</p>
        <div className="flex items-end gap-0.5 h-28">
          {last.map((d) => (
            <div key={d.date} className="flex-1 h-full flex flex-col justify-end gap-0.5" title={`${d.date}: +${d.painted}, заражено ${d.infected}`}>
              <div className="bg-violet-700 rounded-sm" style={{ height: `${(d.infected / peak) * 100}%` }} />
              <div className="bg-emerald-500 rounded-sm" style={{ height: `${(d.painted / peak) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Выполнение плана с начала картины</p>
        {game.habits.map((h) => {
          let planned = 0;
          for (let d = start; d <= t; d = addDays(d, 1)) if (isPlannedDay(h, d) && !isPaused(game.pauses, h.id, d)) planned++;
          if (h.schedule.kind === "perWeek") planned = Math.max(1, Math.round((h.schedule.times * (diffDays(t, start) + 1)) / 7));
          const marks = game.completions.filter((c) => c.habitId === h.id && c.date >= start && c.date <= t).length;
          const pct = Math.min(100, Math.round((marks / Math.max(1, planned)) * 100));
          return (
            <div key={h.id} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate">{h.name}</span>
              <div className="flex-1 h-2 rounded-full bg-neutral-200 overflow-hidden dark:bg-neutral-800">
                <div className="h-full" style={{ width: `${pct}%`, background: h.color }} />
              </div>
              <span className="w-24 text-right text-neutral-500">
                {marks} из {planned}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CollectionView({ game }: { game: GameState }) {
  if (!game.collection.length) return <p className="text-neutral-500">Здесь появятся завершённые картины.</p>;
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {game.collection.map((c, i) => (
        <figure key={i} className="space-y-1">
          <PictureCanvas picture={c.picture} cells={c.cells} className="rounded-lg" />
          <figcaption className="text-sm">
            {c.title} <span className="text-neutral-500">· {c.completedOn}</span>
          </figcaption>
        </figure>
      ))}
    </section>
  );
}

/** Перемотка времени, чтобы проверить заражение без ожидания реальных дней. */
function DemoClock({ game }: { game: GameState }) {
  return (
    <footer className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
      <span>
        Тест-режим: сегодня {today(game)}
        {game.settings.debugOffset ? ` (сдвиг ${game.settings.debugOffset > 0 ? "+" : ""}${game.settings.debugOffset} дн.)` : ""}
      </span>
      <button className="rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800" onClick={() => actions.shiftDays(1)}>
        +1 день
      </button>
      {game.settings.debugOffset !== 0 && (
        <button className="rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800" onClick={() => actions.shiftDays(-game.settings.debugOffset)}>
          Вернуть реальную дату
        </button>
      )}
    </footer>
  );
}
