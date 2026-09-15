const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  const cached = dateFormatterCache.get(timezone);
  if (cached) return cached;
  const next = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  dateFormatterCache.set(timezone, next);
  return next;
}

function partsAt(value: Date, timezone: string) {
  const parts = Object.fromEntries(
    formatter(timezone).formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

export function isIanaTimezone(value: string) {
  try {
    formatter(value).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function dateKeyAt(value: Date, timezone: string) {
  const parts = partsAt(value, timezone);
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

export function addCalendarDays(dateKey: string, amount: number) {
  const [year = 0, month = 1, day = 1] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function startOfZonedDay(dateKey: string, timezone: string) {
  const [year = 0, month = 1, day = 1] = dateKey.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let candidate = new Date(target);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = partsAt(candidate, timezone);
    const observedUtc = Date.UTC(
      observed.year, observed.month - 1, observed.day,
      observed.hour, observed.minute, observed.second,
    );
    candidate = new Date(candidate.getTime() + target - observedUtc);
  }
  return candidate;
}
