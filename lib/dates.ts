import { appConfig } from "@/lib/env";

export function bangkokDate(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appConfig.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

export function bangkokTime(value = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: appConfig.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(value);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return bangkokDate(d);
}

export function monthRange(month: string): { start: string; end: string } {
  const [year, monthNo] = month.split("-").map(Number);
  const start = `${year}-${String(monthNo).padStart(2, "0")}-01`;
  const next = monthNo === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNo + 1).padStart(2, "0")}-01`;
  return { start, end: next };
}

export function dayRange(day: string): { start: string; end: string } {
  return { start: day, end: addDays(day, 1) };
}

export function normalizeMonth(value?: string | null): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return bangkokDate().slice(0, 7);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
