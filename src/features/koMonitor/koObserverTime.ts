const KO_OBSERVER_READY_TIME = {
  hour: 20,
  minute: 39,
  second: 59
} as const;

const KO_OBSERVER_REALTIME_START_TIME = {
  hour: 20,
  minute: 45,
  second: 0
} as const;

const KO_OBSERVER_REALTIME_END_TIME = {
  hour: 21,
  minute: 30,
  second: 0
} as const;

export function isKoObserverStartedForToday(lastStartedAt: Date | null, now: Date): boolean {
  if (lastStartedAt === null || Number.isNaN(lastStartedAt.getTime())) {
    return false;
  }

  return lastStartedAt.getTime() >= createLocalTimeForDate(now, KO_OBSERVER_READY_TIME).getTime();
}

export function shouldUseKoObserverRealtime(now: Date): boolean {
  const start = createLocalTimeForDate(now, KO_OBSERVER_REALTIME_START_TIME).getTime();
  const end = createLocalTimeForDate(now, KO_OBSERVER_REALTIME_END_TIME).getTime();
  const current = now.getTime();

  return current >= start && current < end;
}

export function getNextKoObserverReadBoundary(now: Date): Date | null {
  const start = createLocalTimeForDate(now, KO_OBSERVER_REALTIME_START_TIME);
  const end = createLocalTimeForDate(now, KO_OBSERVER_REALTIME_END_TIME);

  if (now.getTime() < start.getTime()) {
    return start;
  }

  if (now.getTime() < end.getTime()) {
    return end;
  }

  return null;
}

function createLocalTimeForDate(
  date: Date,
  time: { readonly hour: number; readonly minute: number; readonly second: number }
): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.hour,
    time.minute,
    time.second,
    0
  );
}
