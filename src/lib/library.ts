/** Собственные картинки для старта (раздел 7): без чужих персонажей и лицензий. */
export const LIBRARY = [
  { id: "space", title: "Планета", theme: "Космос", src: "/library/space.png" },
  { id: "sunset", title: "Закат в горах", theme: "Природа", src: "/library/sunset.png" },
  { id: "castle", title: "Замок", theme: "Фэнтези", src: "/library/castle.png" },
  { id: "city", title: "Неоновый город", theme: "Киберпанк", src: "/library/city.png" },
  { id: "shield", title: "Щит героя", theme: "Супергерои", src: "/library/shield.png" },
];

export const PALETTE = ["#e5484d", "#f76b15", "#ffc53d", "#46a758", "#12a594", "#0090ff", "#6e56cf", "#d6409f"];

/** Размер сетки под целевой срок (раздел 7). */
export const GRID_FOR_DAYS: Record<number, number> = { 14: 24, 30: 32, 60: 48 };

/** Загружает картинку и уменьшает её до сетки size×size с обрезкой по центру. */
export async function rasterize(src: string, size: number): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}
