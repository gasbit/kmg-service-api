const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function bangkokBusinessDate(now: Date): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function databaseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function bangkokDayStartUtc(value: string): Date {
  return new Date(databaseDate(value).getTime() - BANGKOK_OFFSET_MS);
}

export function bangkokDayEndExclusiveUtc(value: string): Date {
  return new Date(bangkokDayStartUtc(value).getTime() + 24 * 60 * 60 * 1000);
}

export function formatDatabaseDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
