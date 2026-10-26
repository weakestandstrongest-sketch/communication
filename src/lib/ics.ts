import type { EventRow } from "@/lib/types";

function stamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateOnly(iso: string, addDays = 0) {
  const d = new Date(iso);
  d.setDate(d.getDate() + addDays);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");
}

/** Builds an .ics file so members can add an event to their phone's calendar. */
export function buildIcs(e: EventRow, url: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//tsudoi//JA",
    "BEGIN:VEVENT",
    `UID:${e.id}@tsudoi`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    ...(e.all_day
      ? [`DTSTART;VALUE=DATE:${dateOnly(e.starts_at)}`, `DTEND;VALUE=DATE:${dateOnly(e.ends_at ?? e.starts_at, 1)}`]
      : [`DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 3600_000).toISOString())}`]),
    `SUMMARY:${escape(e.title)}`,
    e.location ? `LOCATION:${escape(e.location)}` : "",
    `DESCRIPTION:${escape(`${e.description}\n\n${url}`.trim())}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}
