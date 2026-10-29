export type Lab = [number, number, number];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fi = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
const WX = 0.95047, WZ = 1.08883;

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / WX);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / WZ);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labToRgb([L, a, b]: Lab): [number, number, number] {
  const y = (L + 16) / 116, x = y + a / 500, z = y - b / 200;
  const X = fi(x) * WX, Y = fi(y), Z = fi(z) * WZ;
  return [
    gam(3.2406 * X - 1.5372 * Y - 0.4986 * Z),
    gam(-0.9689 * X + 1.8758 * Y + 0.0415 * Z),
    gam(0.0557 * X - 0.204 * Y + 1.057 * Z),
  ];
}

export const hexToLab = (hex: string) => rgbToLab(...hexToRgb(hex));
export const labToHex = (lab: Lab) => rgbToHex(...labToRgb(lab));
export const deltaE = (p: Lab, q: Lab) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
