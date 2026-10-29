import { deltaE, hexToLab, labToHex, rgbToLab, type Lab } from "./color";
import { rng, type Rng } from "./rng";
import { paintRate } from "./schedule";
import type { Habit, ISODate, Picture, Region } from "./types";

export interface BuildOptions {
  /** RGBA уже уменьшенной до сетки картинки (width × height пикселей). */
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  habits: Habit[];
  background: boolean;
  seed: number;
  startDate: ISODate;
  targetDays: number;
  /** Ручная привязка: кластер → индекс привычки; по умолчанию подбирается по цвету. */
  assignment?: number[];
}

export interface BuildResult {
  picture: Picture;
  /** Предупреждения о дисбалансе областей (раздел 7 документа). */
  warnings: string[];
}

/** Конвейер «картинка → сетка»: k-средних в Lab, чистка шума, фон, привязка к привычкам, порядок открытия. */
export function buildPicture(o: BuildOptions): BuildResult {
  const { width: w, height: h, habits } = o;
  const n = w * h;
  const random = rng(o.seed);
  const labs: Lab[] = [];
  for (let i = 0; i < n; i++) {
    const a = o.pixels[i * 4 + 3];
    // Прозрачность считаем белым фоном.
    labs.push(a < 128 ? [100, 0, 0] : rgbToLab(o.pixels[i * 4], o.pixels[i * 4 + 1], o.pixels[i * 4 + 2]));
  }
  const k = habits.length + (o.background ? 1 : 0);
  const { centers, labels } = kmeans(labs, k, random);
  mergeIslands(labels, w, h, 3);

  const clusters = Array.from({ length: k }, (_, c) => c);
  let bg = -1;
  if (o.background) {
    const border = clusters.map(() => 0);
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border[labels[i]]++;
    }
    bg = border.indexOf(Math.max(...border));
  }
  const habitClusters = clusters.filter((c) => c !== bg);
  const assignment = o.assignment ?? matchColors(habitClusters.map((c) => centers[c]), habits.map((x) => hexToLab(x.color)));

  // Области: сначала привычки в порядке habits, затем фон.
  const regionOfCluster = clusters.map(() => -1);
  habitClusters.forEach((c, j) => (regionOfCluster[c] = assignment[j]));
  if (bg >= 0) regionOfCluster[bg] = habits.length;
  const regionOf = labels.map((c) => regionOfCluster[c]);

  const regions: Region[] = [];
  const warnings: string[] = [];
  habits.forEach((habit, ri) => {
    const cells = regionOf.flatMap((r, i) => (r === ri ? [i] : []));
    const share = cells.length / n;
    if (share > 0.5) warnings.push(`«${habit.name}» занимает ${Math.round(share * 100)}% картины`);
    if (share < 0.03) warnings.push(`«${habit.name}» занимает всего ${Math.round(share * 100)}% картины`);
    regions.push({
      habitId: habit.id,
      color: habit.color,
      order: paintOrder(cells, w, random),
      paintRate: paintRate(habit, o.startDate, o.targetDays, cells.length),
    });
  });
  if (bg >= 0) {
    const cells = regionOf.flatMap((r, i) => (r === habits.length ? [i] : []));
    regions.push({ habitId: null, color: labToHex(centers[bg]), order: cells, paintRate: 0 });
  }

  return {
    picture: { width: w, height: h, seed: o.seed, startDate: o.startDate, regionOf, shade: labs.map((l) => l[0]), regions },
    warnings,
  };
}

function kmeans(points: Lab[], k: number, random: Rng, iterations = 20) {
  // k-means++: каждый следующий центр выбирается подальше от уже выбранных.
  const centers: Lab[] = [points[random.int(points.length)]];
  while (centers.length < k) {
    const d = points.map((p) => Math.min(...centers.map((c) => deltaE(p, c))) ** 2);
    const sum = d.reduce((a, b) => a + b, 0);
    let t = random.next() * sum;
    let i = 0;
    while (i < d.length - 1 && (t -= d[i]) > 0) i++;
    centers.push(points[i]);
  }
  const labels = points.map(() => 0);
  for (let it = 0; it < iterations; it++) {
    points.forEach((p, i) => {
      let best = 0;
      for (let c = 1; c < k; c++) if (deltaE(p, centers[c]) < deltaE(p, centers[best])) best = c;
      labels[i] = best;
    });
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => labels[i] === c);
      if (!members.length) {
        // Пустой кластер забирает самую далёкую от своего центра точку.
        let far = 0;
        points.forEach((p, i) => deltaE(p, centers[labels[i]]) > deltaE(points[far], centers[labels[far]]) && (far = i));
        centers[c] = points[far];
        labels[far] = c;
        continue;
      }
      centers[c] = [0, 1, 2].map((j) => members.reduce((s, m) => s + m[j], 0) / members.length) as Lab;
    }
  }
  return { centers, labels };
}

/** Острова меньше minSize клеток присоединяются к самому частому соседнему кластеру. */
function mergeIslands(labels: number[], w: number, h: number, minSize: number) {
  const seen = new Array(labels.length).fill(false);
  for (let s = 0; s < labels.length; s++) {
    if (seen[s]) continue;
    const island = [s];
    seen[s] = true;
    for (let q = 0; q < island.length; q++)
      for (const nb of around(island[q], w, h))
        if (!seen[nb] && labels[nb] === labels[s]) {
          seen[nb] = true;
          island.push(nb);
        }
    if (island.length >= minSize) continue;
    const votes = new Map<number, number>();
    for (const c of island) for (const nb of around(c, w, h)) if (labels[nb] !== labels[s]) votes.set(labels[nb], (votes.get(labels[nb]) ?? 0) + 1);
    if (!votes.size) continue;
    const winner = [...votes].sort((a, b) => b[1] - a[1])[0][0];
    // Не даём кластеру исчезнуть целиком: у каждой привычки должна остаться область.
    if (labels.filter((l) => l === labels[s]).length <= island.length) continue;
    for (const c of island) labels[c] = winner;
  }
}

/** Привязка кластеров к привычкам перебором перестановок по минимуму суммарного ΔE (K ≤ 7). */
function matchColors(clusters: Lab[], habits: Lab[]) {
  let best: number[] = habits.map((_, i) => i);
  let bestCost = Infinity;
  const permute = (rest: number[], acc: number[]) => {
    if (!rest.length) {
      const cost = acc.reduce((s, hi, ci) => s + deltaE(clusters[ci], habits[hi]), 0);
      if (cost < bestCost) [bestCost, best] = [cost, acc];
      return;
    }
    rest.forEach((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
  };
  permute(habits.map((_, i) => i), []);
  return best;
}

/** Порядок открытия: от клетки у центра области наружу, с небольшим шумом, чтобы края были живыми. */
function paintOrder(cells: number[], w: number, random: Rng) {
  if (!cells.length) return [];
  const cx = cells.reduce((s, c) => s + (c % w), 0) / cells.length;
  const cy = cells.reduce((s, c) => s + Math.floor(c / w), 0) / cells.length;
  const dist = (c: number, x: number, y: number) => Math.hypot((c % w) - x, Math.floor(c / w) - y);
  const seed = cells.reduce((a, c) => (dist(c, cx, cy) < dist(a, cx, cy) ? c : a));
  const sx = seed % w, sy = Math.floor(seed / w);
  return cells
    .map((c) => ({ c, d: dist(c, sx, sy) + random.next() * 1.5 }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.c);
}

function around(c: number, w: number, h: number) {
  const x = c % w, y = (c - x) / w;
  const out: number[] = [];
  if (y > 0) out.push(c - w);
  if (x < w - 1) out.push(c + 1);
  if (y < h - 1) out.push(c + w);
  if (x > 0) out.push(c - 1);
  return out;
}
