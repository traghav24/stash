// Time made visible. Everything here speaks in "in 2 days" and "~3h left", never bare timestamps.

const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

export function relativeDay(date, now = new Date()) {
  const d = new Date(date);
  const n = daysBetween(now, d);
  if (n < 0) return "still on your plate";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  const dow = d.getDay();
  const weekend = dow === 0 || dow === 6;
  if (n <= 6 && weekend) return "this weekend";
  if (n <= 6) return `in ${n} days · ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
  if (n <= 13) return "next week";
  if (n <= 31) return `in ${Math.round(n / 7)} weeks`;
  return `in ${Math.round(n / 30)} months`;
}

export function relativeTime(date, now = new Date()) {
  const mins = Math.round((new Date(date) - now) / 60000);
  if (Math.abs(mins) < 1) return "now";
  if (mins > 0 && mins < 60) return `in ${mins} min`;
  if (mins > 0 && mins < 60 * 12) return `in ${fmtDuration(mins)}`;
  if (mins < 0 && mins > -60) return `${-mins} min ago`;
  return null;
}

export const hasTime = (date) => {
  const d = new Date(date);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
};

export function fmtDuration(mins) {
  if (mins == null) return "";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = mins / 60;
  return h % 1 < 0.15 || h % 1 > 0.85 ? `${Math.round(h)}h` : `${h.toFixed(1).replace(/\.0$/, "")}h`;
}

export function sinceLabel(date, now = new Date()) {
  const n = daysBetween(new Date(date), now);
  if (n <= 0) return "touched today";
  if (n === 1) return "touched yesterday";
  if (n < 14) return `last touched ${n} days ago`;
  return `last touched ${Math.round(n / 7)} weeks ago`;
}

// Working minutes left today, from the person's own hours.
export function minutesLeftToday(settings, now = new Date()) {
  const end = new Date(now);
  end.setHours(settings.dayEnd ?? 19, 0, 0, 0);
  const start = new Date(now);
  start.setHours(settings.dayStart ?? 10, 0, 0, 0);
  const from = now < start ? start : now;
  return Math.max(0, (end - from) / 60000);
}

export function dayProgress(settings, now = new Date()) {
  const total = ((settings.dayEnd ?? 19) - (settings.dayStart ?? 10)) * 60;
  return total > 0 ? 1 - minutesLeftToday(settings, now) / total : 1;
}

// Estimates learn from you: if design tasks usually take 2x, the next guess is 2x.
export function adjustedEstimate(item, settings) {
  const base = item.estimateMin ?? 30;
  const r = settings.estimateRatio?.[item.cluster] ?? settings.estimateRatio?._all;
  const ratio = r && r.n >= 2 ? Math.min(3, Math.max(0.5, r.ratio)) : 1;
  return Math.round(base * ratio);
}

export function learnFrom(item, actualMin, settings) {
  if (!item.estimateMin || actualMin < 2) return settings.estimateRatio || {};
  const sample = actualMin / item.estimateMin;
  const next = { ...(settings.estimateRatio || {}) };
  for (const k of [item.cluster, "_all"]) {
    const prev = next[k] || { ratio: 1, n: 0 };
    const n = Math.min(prev.n + 1, 10); // rolling, so it keeps adapting
    next[k] = { ratio: prev.ratio + (sample - prev.ratio) / n, n };
  }
  return next;
}

export const isOpenTask = (i) => i.isTask && !i.done;

// Today = due today, plus anything that slipped (shown gently, never as "overdue"), plus a running task.
export function todayTasks(items, now = new Date()) {
  return items
    .filter(isOpenTask)
    .filter((i) => i.startedAt || (i.due && daysBetween(now, new Date(i.due)) <= 0))
    .sort((a, b) => rank(a, now) - rank(b, now) || new Date(a.due || 0) - new Date(b.due || 0));
}

// Running first, then things with a time today, then the rest of today, then what slipped.
function rank(t, now) {
  if (t.startedAt) return 0;
  const d = new Date(t.due);
  const n = daysBetween(now, d);
  if (n === 0 && hasTime(t.due)) return 1;
  if (n === 0) return 2;
  return 3;
}

// "What now?": the most urgent thing that fits the time left; otherwise the smallest thing.
export function pickNext(items, settings, now = new Date()) {
  const left = minutesLeftToday(settings, now);
  const pool = todayTasks(items, now);
  const upcoming = items.filter(isOpenTask).filter((i) => !pool.includes(i)).sort((a, b) => new Date(a.due || 8.64e15) - new Date(b.due || 8.64e15));
  const candidates = pool.length ? pool : upcoming.slice(0, 5);
  if (!candidates.length) return null;
  const fits = candidates.filter((i) => adjustedEstimate(i, settings) <= left);
  return fits[0] || [...candidates].sort((a, b) => adjustedEstimate(a, settings) - adjustedEstimate(b, settings))[0];
}

export function petPose(settings, now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  const start = settings.dayStart ?? 10;
  const end = settings.dayEnd ?? 19;
  if (h < start - 3 || h >= end + 2) return "sleepy"; // night: curled up, zz
  if (h < start) return "peek-sleepy"; // waking up
  if (h < Math.max(start + 2.5, 12.5)) return "peek-alert"; // alert morning
  if (h < end - 1) return "lying"; // settled afternoon
  return "half-asleep"; // winding down
}
