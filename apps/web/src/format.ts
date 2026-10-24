const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
// Altijd Nederlandse tijd, ook als het apparaat in een andere tijdzone staat.
const dateTime = new Intl.DateTimeFormat('nl-NL', {
  timeZone: 'Europe/Amsterdam',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const relative = new Intl.RelativeTimeFormat('nl-NL', { numeric: 'auto' });

export const formatEuro = (n: number | null) => (n == null ? '–' : euro.format(n));
export const formatDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '–');

export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return '–';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'zojuist';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return relative.format(Math.round(diff / 3_600_000), 'hour');
  return relative.format(Math.round(diff / 86_400_000), 'day');
}

export function address(l: { street: string | null; house_number: string | null }) {
  return [l.street, l.house_number].filter(Boolean).join(' ') || 'Adres onbekend';
}
