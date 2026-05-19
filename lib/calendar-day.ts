/**
 * Calendar **YYYY-MM-DD** in the **device local** timezone.
 * Used for daily DCA eligibility so a new buy is allowed after local 00:00,
 * at most once per calendar day per asset.
 */
export function localCalendarDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add whole local calendar days to a YYYY-MM-DD string. */
export function addLocalCalendarDays(ymd: string, delta: number): string {
  const parts = ymd.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const mo = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const dt = new Date(y, mo - 1, day + delta);
  return localCalendarDate(dt);
}
