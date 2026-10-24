const amsterdamClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Amsterdam',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Minuten sinds middernacht, Nederlandse tijd (houdt rekening met zomer- en wintertijd).
export function amsterdamMinuteOfDay(now: Date): number {
  const parts = amsterdamClock.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  return hour * 60 + minute;
}

// Willekeurige afwijking van ±fraction, zodat de requests geen strak robotpatroon hebben.
export function jitter(ms: number, fraction: number): number {
  return Math.round(ms * (1 + (Math.random() * 2 - 1) * fraction));
}

const formatter = new Intl.DateTimeFormat('nl-NL', {
  timeZone: 'Europe/Amsterdam',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatAmsterdam(iso: string): string {
  return formatter.format(new Date(iso));
}
