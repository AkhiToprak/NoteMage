// Single source of truth for ordering timeline events by year. Handles
// "300 BCE"/"BC" (negative), "1914 CE"/"AD", and bare integers; unparseable
// values sort as 0. Shared by the timeline renderer (the on-screen axis), the
// grader's chronology, and the PDF exporter's answer key so all three agree on
// what "chronological order" means — including BCE / mixed-era years that don't
// sort lexically.
export function parseYearForSort(year: string): number {
  const trimmed = year.trim();
  const bceMatch = /^(-?\d+)\s*(?:bce|bc)$/i.exec(trimmed);
  if (bceMatch) return -Math.abs(parseInt(bceMatch[1], 10));
  const ceMatch = /^(-?\d+)\s*(?:ce|ad)$/i.exec(trimmed);
  if (ceMatch) return parseInt(ceMatch[1], 10);
  const direct = parseInt(trimmed, 10);
  if (Number.isFinite(direct)) return direct;
  return 0;
}
