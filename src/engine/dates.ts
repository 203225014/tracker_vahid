import type { ISODate } from "./types";

const DAY = 86_400_000;

export const toDays = (d: ISODate) => Date.parse(d + "T00:00:00Z") / DAY;
export const fromDays = (n: number): ISODate => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (d: ISODate, n: number) => fromDays(toDays(d) + n);
export const diffDays = (a: ISODate, b: ISODate) => toDays(a) - toDays(b);
/** 0 = понедельник … 6 = воскресенье. */
export const weekday = (d: ISODate) => (new Date(toDays(d) * DAY).getUTCDay() + 6) % 7;
export const weekStart = (d: ISODate) => addDays(d, -weekday(d));
