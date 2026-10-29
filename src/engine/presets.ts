import type { Rules } from "./types";

export type Preset = "soft" | "normal" | "hard";

export const PRESETS: Record<Preset, Rules> = {
  soft: { punish: true, grace: 2, rate: 0.5, cleanseCost: 1, cap: 0.25, crossSpread: false, backfillDays: 2, shieldEvery: 5, shieldMax: 3 },
  normal: { punish: true, grace: 1, rate: 1, cleanseCost: 1, cap: 0.5, crossSpread: false, backfillDays: 1, shieldEvery: 7, shieldMax: 2 },
  hard: { punish: true, grace: 0, rate: 2, cleanseCost: 2, cap: 1, crossSpread: true, backfillDays: 0, shieldEvery: 0, shieldMax: 0 },
};

export const PRESET_LABELS: Record<Preset, string> = {
  soft: "Мягкий",
  normal: "Обычный",
  hard: "Жёсткий",
};
