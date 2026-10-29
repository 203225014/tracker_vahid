"use client";

import { useEffect, useMemo, useRef } from "react";
import { hexToLab, labToHex } from "@/engine/color";
import { Cell, type Picture } from "@/engine/types";

interface Props {
  picture: Picture;
  /** Без cells рисуется готовая картина (предпросмотр). */
  cells?: Cell[];
  threatened?: number[];
  className?: string;
}

const INFECTED = ["#2a0b3d", "#3b1050", "#4a1563"];

/** Цвет клетки: оттенок области со светлотой исходного пикселя, чтобы сохранить объём (раздел 2). */
export function useCellColors(picture: Picture) {
  return useMemo(() => {
    const means = picture.regions.map((_, ri) => {
      const ls = picture.shade.filter((_, i) => picture.regionOf[i] === ri);
      return ls.reduce((a, b) => a + b, 0) / Math.max(1, ls.length);
    });
    return picture.regionOf.map((ri, i) => {
      const region = picture.regions[ri];
      if (region.habitId === null) return labToHex([picture.shade[i], ...hexToLab(region.color).slice(1)] as [number, number, number]);
      const [L, a, b] = hexToLab(region.color);
      const shaded = Math.max(18, Math.min(92, L + (picture.shade[i] - means[ri]) * 0.7));
      return labToHex([shaded, a, b]);
    });
  }, [picture]);
}

export function PictureCanvas({ picture, cells, threatened = [], className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = useCellColors(picture);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { width: w, height: h } = picture;
    const size = 16;
    canvas.width = w * size;
    canvas.height = h * size;
    const ctx = canvas.getContext("2d")!;
    const threat = new Set(threatened);
    let frame = 0;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < w * h; i++) {
        const x = (i % w) * size;
        const y = Math.floor(i / w) * size;
        const state = cells ? cells[i] : Cell.Protected;
        const color = colors[i];
        if (state === Cell.Closed) {
          ctx.fillStyle = "#ececec";
          ctx.fillRect(x, y, size, size);
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = color;
          ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
          ctx.globalAlpha = 1;
        } else if (state === Cell.Infected) {
          ctx.fillStyle = INFECTED[(i * 7 + (i >> 3)) % 3];
          ctx.fillRect(x, y, size, size);
          ctx.fillStyle = "#8a2be2";
          ctx.fillRect(x + ((i * 5) % 9) + 2, y + ((i * 3) % 9) + 2, 3, 3);
        } else if (state === Cell.Cleansed) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, y, size, size);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, size, size);
          if (state === Cell.Liberated) {
            ctx.fillStyle = "rgba(255,255,255,0.45)";
            ctx.fillRect(x + 5, y + 5, 6, 6);
          }
        }
        if (threat.has(i)) {
          // Жёлто-чёрная мигающая рамка заметна на любом цвете области.
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t / 250);
          ctx.strokeStyle = "#111111";
          ctx.lineWidth = 4;
          ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
          ctx.strokeStyle = "#ffd60a";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
          ctx.globalAlpha = 1;
        }
      }
      if (threat.size) frame = requestAnimationFrame(draw);
    };
    draw(0);
    return () => cancelAnimationFrame(frame);
  }, [picture, cells, threatened, colors]);

  return <canvas ref={ref} className={className} style={{ imageRendering: "pixelated", width: "100%", aspectRatio: `${picture.width} / ${picture.height}` }} />;
}
