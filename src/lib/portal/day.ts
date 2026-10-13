/**
 * The civil date of an instant in a time zone, as YYYY-MM-DD. "Today" on the
 * Activity page is a day where the chapter is, so an evening's work is not
 * split in two by midnight somewhere else.
 */
export function civilDate(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
