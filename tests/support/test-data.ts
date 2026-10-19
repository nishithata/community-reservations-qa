import { test } from "@playwright/test";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Returns a UTC time slot far enough in the future that it won't collide with
 * seed data, other tests, or other parallel workers. Each call gets a fresh slot.
 */
let counter = 0;
export function uniqueSlot(hours = 1): { starts_at: string; ends_at: string; date: string; startTime: string } {
  const workerIndex = test.info().workerIndex;
  counter += 1;
  // Spread across ~2 years: random base day + per-worker and per-call offsets.
  const dayOffset = 400 + Math.floor(Math.random() * 300) + workerIndex * 3 + counter;
  const hour = 6 + Math.floor(Math.random() * 10); // 06:00-15:00 UTC start
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) + dayOffset * DAY + hour * HOUR);
  const end = new Date(start.getTime() + hours * HOUR);
  return {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    date: start.toISOString().slice(0, 10),
    startTime: start.toISOString().slice(11, 16),
  };
}

export function uniqueEmail(prefix = "qa"): string {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const addMinutes = (iso: string, minutes: number): string =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
