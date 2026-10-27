/** 日本の祝日（1980〜2099年）。振替休日と国民の休日を含みます。 */

function nthMonday(year: number, month: number, n: number): number {
  const first = new Date(year, month - 1, 1).getDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}

const cache = new Map<number, Map<string, string>>();

function key(month: number, day: number) {
  return `${month}-${day}`;
}

function build(year: number): Map<string, string> {
  const h = new Map<string, string>();
  const add = (m: number, d: number, name: string) => h.set(key(m, d), name);
  const base = year - 1980;
  const spring = Math.floor(20.8431 + 0.242194 * base - Math.floor(base / 4));
  const autumn = Math.floor(23.2488 + 0.242194 * base - Math.floor(base / 4));

  add(1, 1, "元日");
  add(1, nthMonday(year, 1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  if (year >= 2020) add(2, 23, "天皇誕生日");
  add(3, spring, "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  add(7, nthMonday(year, 7, 3), "海の日");
  add(8, 11, "山の日");
  add(9, nthMonday(year, 9, 3), "敬老の日");
  add(9, autumn, "秋分の日");
  add(10, nthMonday(year, 10, 2), "スポーツの日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  // 国民の休日: 前日と翌日がともに祝日である平日
  for (let m = 1; m <= 12; m++) {
    const days = new Date(year, m, 0).getDate();
    for (let d = 2; d < days; d++) {
      const dow = new Date(year, m - 1, d).getDay();
      if (dow !== 0 && !h.has(key(m, d)) && h.has(key(m, d - 1)) && h.has(key(m, d + 1))) add(m, d, "国民の休日");
    }
  }
  // 振替休日: 日曜の祝日の次の、祝日でない日
  for (const k of Array.from(h.keys())) {
    const [m, d] = k.split("-").map(Number);
    if (new Date(year, m - 1, d).getDay() !== 0) continue;
    let next = new Date(year, m - 1, d + 1);
    while (h.has(key(next.getMonth() + 1, next.getDate()))) next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
    if (next.getFullYear() === year) add(next.getMonth() + 1, next.getDate(), "振替休日");
  }
  return h;
}

/** 祝日名。祝日でなければ null */
export function holidayName(date: Date): string | null {
  const y = date.getFullYear();
  let map = cache.get(y);
  if (!map) cache.set(y, (map = build(y)));
  return map.get(key(date.getMonth() + 1, date.getDate())) ?? null;
}
