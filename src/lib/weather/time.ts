export function zonedParts(date: Date, timeZone: string): { date: string; hour: string; hourKey: string } {
  let zone = timeZone;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  hour = hour.padStart(2, "0");
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  return { date: dateStr, hour, hourKey: `${dateStr}T${hour}` };
}

export function todayKey(timeZone: string, now = new Date()): string {
  return zonedParts(now, timeZone).date;
}

export function hourKeyNow(timeZone: string, now = new Date()): string {
  return zonedParts(now, timeZone).hourKey;
}

export function omLocalKey(stamp: string): { date: string; hourKey: string } {
  const date = stamp.slice(0, 10);
  const hour = stamp.slice(11, 13).padStart(2, "0");
  return { date, hourKey: `${date}T${hour}` };
}

export function formatLongDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
}

export function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatDayName(date: string, today: string): string {
  if (date === today) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

export function formatMonthDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

export function formatHourTick(hourKey: string): string {
  const h = Number(hourKey.slice(11, 13));
  if (!Number.isFinite(h)) return "";
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

export function formatHourTip(hourKey: string): string {
  return `${formatDayName(hourKey.slice(0, 10), "")} ${formatHourTick(hourKey)}`.trim();
}

export function formatRadarTime(unixSeconds: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(unixSeconds * 1000));
}
