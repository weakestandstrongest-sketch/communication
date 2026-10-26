import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isSameYear,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";
import { ja } from "date-fns/locale";

type DateInput = string | number | Date;
const d = (v: DateInput) => (v instanceof Date ? v : new Date(v));

/** 14:05 */
export function formatTime(v: DateInput): string {
  return format(d(v), "H:mm");
}

/** Chat list: 14:05 / 昨日 / 火曜日 / 3/12 / 2024/3/12 */
export function formatListTime(v: DateInput): string {
  const date = d(v);
  if (isToday(date)) return format(date, "H:mm");
  if (isYesterday(date)) return "昨日";
  if (differenceInCalendarDays(new Date(), date) < 7) return format(date, "EEEE", { locale: ja });
  if (isSameYear(date, new Date())) return format(date, "M/d");
  return format(date, "yyyy/M/d");
}

/** Chat date separator: 今日 / 昨日 / 3月12日(火) / 2024年3月12日(火) */
export function formatDaySeparator(v: DateInput): string {
  const date = d(v);
  if (isToday(date)) return "今日";
  if (isYesterday(date)) return "昨日";
  if (isSameYear(date, new Date())) return format(date, "M月d日(E)", { locale: ja });
  return format(date, "yyyy年M月d日(E)", { locale: ja });
}

/** 3月12日(火) */
export function formatDate(v: DateInput, withYear = false): string {
  const date = d(v);
  return format(date, withYear || !isSameYear(date, new Date()) ? "yyyy年M月d日(E)" : "M月d日(E)", { locale: ja });
}

/** 3月12日(火) 14:00 */
export function formatDateTime(v: DateInput): string {
  return `${formatDate(v)} ${formatTime(v)}`;
}

/** Event time range. */
export function formatEventRange(startsAt: string, endsAt: string | null, allDay: boolean): string {
  const s = d(startsAt);
  if (allDay) {
    if (endsAt && !isSameDay(s, d(endsAt))) return `${formatDate(s)} 〜 ${formatDate(endsAt)}（終日）`;
    return `${formatDate(s)}（終日）`;
  }
  if (!endsAt) return `${formatDate(s)} ${formatTime(s)}〜`;
  const e = d(endsAt);
  if (isSameDay(s, e)) return `${formatDate(s)} ${formatTime(s)}〜${formatTime(e)}`;
  return `${formatDateTime(s)} 〜 ${formatDateTime(e)}`;
}

/** Relative day label used on cards: 今日 / 明日 / あと3日 */
export function relativeDay(v: DateInput): string {
  const date = d(v);
  if (isToday(date)) return "今日";
  if (isTomorrow(date)) return "明日";
  const diff = differenceInCalendarDays(date, new Date());
  if (diff > 0) return `あと${diff}日`;
  if (diff === -1) return "昨日";
  return `${-diff}日前`;
}

/** 締切 label: 「あと3時間」「締切済み」 */
export function formatDeadline(v: DateInput | null): string {
  if (!v) return "締切なし";
  const date = d(v);
  if (date.getTime() <= Date.now()) return "締切済み";
  return `あと${formatDistanceToNowStrict(date, { locale: ja })}`;
}

export function formatAgo(v: DateInput): string {
  const date = d(v);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "たった今";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}分前`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}時間前`;
  if (diffMs < 7 * 86_400_000) return `${Math.floor(diffMs / 86_400_000)}日前`;
  return formatDate(date);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Value for <input type="datetime-local"> in the user's local time zone. */
export function toLocalInputValue(v: DateInput | null | undefined): string {
  if (!v) return "";
  return format(d(v), "yyyy-MM-dd'T'HH:mm");
}

export function toLocalDateInputValue(v: DateInput | null | undefined): string {
  if (!v) return "";
  return format(d(v), "yyyy-MM-dd");
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
