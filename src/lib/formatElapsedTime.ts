/**
 * formatElapsedTime — pure formatter for how long a learner took on one
 * attempt (worksheet result overlay, owner bug report: "con todos los
 * indicadores de cuanto tiempo tardaste"). Short form only — "1 min 23 s"
 * / "45 s" — the same in both locales (`min`/`s` read identically in
 * Spanish and English), so there is no `Lang` argument to thread through;
 * `GameResult` calls this directly with just the elapsed milliseconds.
 *
 * Seconds are rounded to the nearest whole second (not floored) so a
 * 59.6s attempt reads "1 min 0 s" rather than "59 s" lying by half a
 * second — the rounding can carry a full minute, hence computing
 * `totalSeconds` first and deriving minutes/seconds from THAT, never from
 * independently-rounded minutes and seconds.
 */
export function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds} s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} s`;
}
