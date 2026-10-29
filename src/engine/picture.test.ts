import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";
import { buildPicture } from "./picture";
import type { Habit } from "./types";

const habit = (id: string, color: string): Habit => ({
  id, name: id, color, schedule: { kind: "days", days: [0, 1, 2, 3, 4, 5, 6] }, rules: [{ from: "2026-01-05", rules: PRESETS.normal }],
});

/** 16×16: белый фон, красный квадрат слева, синий справа. */
function pixels() {
  const w = 16, px: number[] = [];
  for (let i = 0; i < w * w; i++) {
    const x = i % w, y = Math.floor(i / w);
    const inside = y >= 4 && y < 12;
    const rgb = inside && x >= 2 && x < 7 ? [220, 30, 30] : inside && x >= 9 && x < 14 ? [30, 60, 220] : [255, 255, 255];
    px.push(...rgb, 255);
  }
  return px;
}

describe("buildPicture", () => {
  const habits = [habit("blue", "#2050ff"), habit("red", "#ff2020")];
  const { picture } = buildPicture({ pixels: pixels(), width: 16, height: 16, habits, background: true, seed: 7, startDate: "2026-01-05", targetDays: 30 });

  it("находит фон по краям и привязывает цвета к привычкам", () => {
    const at = (x: number, y: number) => picture.regions[picture.regionOf[y * 16 + x]].habitId;
    expect(at(0, 0)).toBeNull();
    expect(at(3, 6)).toBe("red");
    expect(at(10, 6)).toBe("blue");
  });

  it("считает P = ⌈клеток / плановых⌉", () => {
    const red = picture.regions.find((r) => r.habitId === "red")!;
    expect(red.order).toHaveLength(40);
    expect(red.paintRate).toBe(2);
  });

  it("порядок открытия покрывает область ровно один раз", () => {
    for (const r of picture.regions) expect(new Set(r.order).size).toBe(r.order.length);
  });
});
