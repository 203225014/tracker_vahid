"use client";

import { useEffect, useState } from "react";
import { buildPicture, type BuildResult } from "@/engine/picture";
import { PRESET_LABELS, PRESETS, type Preset } from "@/engine/presets";
import type { Habit, Schedule } from "@/engine/types";
import { GRID_FOR_DAYS, LIBRARY, PALETTE, rasterize } from "@/lib/library";
import { actions, presetOf, today, type GameState } from "@/lib/store";
import { PictureCanvas } from "./PictureCanvas";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface Draft {
  id: string;
  name: string;
  color: string;
  schedule: Schedule;
  preset: Preset;
  punish: boolean;
}

const newDraft = (i: number): Draft => ({
  id: crypto.randomUUID(),
  name: "",
  color: PALETTE[i % PALETTE.length],
  schedule: { kind: "days", days: [0, 1, 2, 3, 4, 5, 6] },
  preset: "normal",
  punish: true,
});

const fromHabit = (h: Habit): Draft => {
  const rules = h.rules[h.rules.length - 1].rules;
  const p = presetOf(rules);
  return { id: h.id, name: h.name, color: h.color, schedule: h.schedule, preset: p === "custom" ? "normal" : p, punish: rules.punish };
};

export function Onboarding({ game }: { game: GameState }) {
  const [step, setStep] = useState<1 | 2>(game.habits.length ? 2 : 1);
  const [drafts, setDrafts] = useState<Draft[]>(game.habits.length ? game.habits.map(fromHabit) : [newDraft(0)]);
  const start = today(game);

  const habits: Habit[] = drafts.map((d) => ({
    id: d.id,
    name: d.name.trim() || "Привычка",
    color: d.color,
    schedule: d.schedule,
    rules: [{ from: start, rules: { ...PRESETS[d.preset], punish: d.punish } }],
  }));

  const valid = drafts.every((d) => d.name.trim() && (d.schedule.kind === "perWeek" || d.schedule.days.length));
  const update = (id: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  if (step === 2) return <PicturePicker habits={habits} start={start} onBack={() => setStep(1)} />;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Шаг 1. Ваши привычки</h2>
        <p className="text-sm text-neutral-500">От 1 до 6 привычек. У каждой свой цвет и своя область на картине.</p>
      </div>
      {drafts.map((d) => (
        <div key={d.id} className="rounded-xl border border-neutral-200 p-4 space-y-3 dark:border-neutral-800">
          <div className="flex gap-2 items-center">
            <input
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 bg-transparent dark:border-neutral-700"
              placeholder="Например, зарядка"
              value={d.name}
              onChange={(e) => update(d.id, { name: e.target.value })}
            />
            {drafts.length > 1 && (
              <button className="text-sm text-neutral-500" onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}>
                Удалить
              </button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {PALETTE.map((c) => (
              <button
                key={c}
                aria-label={`Цвет ${c}`}
                onClick={() => update(d.id, { color: c })}
                className={`h-7 w-7 rounded-full border-2 ${d.color === c ? "border-neutral-900 dark:border-white" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <select
              className="rounded-lg border border-neutral-300 px-2 py-1 bg-transparent dark:border-neutral-700"
              value={d.schedule.kind}
              onChange={(e) =>
                update(d.id, { schedule: e.target.value === "days" ? { kind: "days", days: [0, 1, 2, 3, 4, 5, 6] } : { kind: "perWeek", times: 3 } })
              }
            >
              <option value="days">По дням недели</option>
              <option value="perWeek">N раз в неделю</option>
            </select>
            {d.schedule.kind === "days" ? (
              WEEKDAYS.map((label, wd) => {
                const days = d.schedule.kind === "days" ? d.schedule.days : [];
                const on = days.includes(wd);
                return (
                  <button
                    key={label}
                    onClick={() => update(d.id, { schedule: { kind: "days", days: on ? days.filter((x) => x !== wd) : [...days, wd].sort() } })}
                    className={`rounded-md px-2 py-1 ${on ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 dark:bg-neutral-800"}`}
                  >
                    {label}
                  </button>
                );
              })
            ) : (
              <select
                className="rounded-lg border border-neutral-300 px-2 py-1 bg-transparent dark:border-neutral-700"
                value={d.schedule.times}
                onChange={(e) => update(d.id, { schedule: { kind: "perWeek", times: Number(e.target.value) } })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} раз(а) в неделю
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={d.punish} onChange={(e) => update(d.id, { punish: e.target.checked })} />
              Заражение за пропуски
            </label>
            {d.punish && (
              <select
                className="rounded-lg border border-neutral-300 px-2 py-1 bg-transparent dark:border-neutral-700"
                value={d.preset}
                onChange={(e) => update(d.id, { preset: e.target.value as Preset })}
              >
                {(Object.keys(PRESETS) as Preset[]).map((p) => (
                  <option key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-3">
        {drafts.length < 6 && (
          <button className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700" onClick={() => setDrafts((ds) => [...ds, newDraft(ds.length)])}>
            + Привычка
          </button>
        )}
        <button disabled={!valid} className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900" onClick={() => setStep(2)}>
          Дальше: картина
        </button>
      </div>
    </section>
  );
}

function PicturePicker({ habits, start, onBack }: { habits: Habit[]; start: string; onBack: () => void }) {
  const [src, setSrc] = useState(LIBRARY[0].src);
  const [title, setTitle] = useState(LIBRARY[0].title);
  const [days, setDays] = useState(30);
  const [background, setBackground] = useState(true);
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [result, setResult] = useState<BuildResult | null>(null);
  const habitsKey = JSON.stringify(habits);

  useEffect(() => {
    let cancelled = false;
    const size = GRID_FOR_DAYS[days];
    rasterize(src, size).then((pixels) => {
      if (cancelled) return;
      setResult(buildPicture({ pixels, width: size, height: size, habits: JSON.parse(habitsKey), background, seed, startDate: start, targetDays: days }));
    });
    return () => {
      cancelled = true;
    };
  }, [src, days, background, seed, start, habitsKey]);

  const upload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(String(reader.result));
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Шаг 2. Картина</h2>
        <p className="text-sm text-neutral-500">Картина разбивается на области по цветам, одна область на привычку.</p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {LIBRARY.map((img) => (
          <button
            key={img.id}
            onClick={() => {
              setSrc(img.src);
              setTitle(img.title);
            }}
            className={`rounded-lg overflow-hidden border-2 ${src === img.src ? "border-neutral-900 dark:border-white" : "border-transparent"}`}
            title={`${img.title} · ${img.theme}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.src} alt={img.title} className="w-full" style={{ imageRendering: "pixelated" }} />
          </button>
        ))}
        <label className="rounded-lg border-2 border-dashed border-neutral-300 flex items-center justify-center text-xs text-center p-2 cursor-pointer dark:border-neutral-700">
          Своя картинка
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm items-center">
        <label className="flex items-center gap-2">
          Срок
          <select className="rounded-lg border border-neutral-300 px-2 py-1 bg-transparent dark:border-neutral-700" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {Object.entries(GRID_FOR_DAYS).map(([d, s]) => (
              <option key={d} value={d}>
                {d} дней ({s}×{s})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
          Фон нарисован сразу
        </label>
      </div>
      {result && (
        <div className="grid sm:grid-cols-2 gap-4 items-start">
          <PictureCanvas picture={result.picture} className="rounded-lg border border-neutral-200 dark:border-neutral-800" />
          <div className="space-y-2 text-sm">
            {result.picture.regions.map((r, i) => {
              const h = habits.find((x) => x.id === r.habitId);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded" style={{ background: r.color }} />
                  <span className="flex-1">{h ? h.name : "Фон"}</span>
                  <span className="text-neutral-500">{h ? `${r.order.length} клеток, ${r.paintRate} за отметку` : `${r.order.length} клеток`}</span>
                </div>
              );
            })}
            {result.warnings.map((w) => (
              <p key={w} className="text-amber-600">
                {w}. Возможно, стоит выбрать другую картину.
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <button className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700" onClick={onBack}>
          Назад
        </button>
        <button
          disabled={!result}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          onClick={() => result && actions.startGame(habits, { title, targetDays: days, picture: result.picture })}
        >
          Начать картину
        </button>
      </div>
    </section>
  );
}
