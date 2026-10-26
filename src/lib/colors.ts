export const GROUP_COLORS = ["indigo", "blue", "teal", "green", "amber", "orange", "rose", "violet", "slate"] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

const MAP: Record<GroupColor, { bg: string; fg: string; label: string }> = {
  indigo: { bg: "#4b5fd6", fg: "#ffffff", label: "藍" },
  blue: { bg: "#2f7fe0", fg: "#ffffff", label: "青" },
  teal: { bg: "#139a9a", fg: "#ffffff", label: "青緑" },
  green: { bg: "#2c9a55", fg: "#ffffff", label: "緑" },
  amber: { bg: "#d99a10", fg: "#ffffff", label: "山吹" },
  orange: { bg: "#e46f2a", fg: "#ffffff", label: "橙" },
  rose: { bg: "#d9466f", fg: "#ffffff", label: "紅" },
  violet: { bg: "#8656d1", fg: "#ffffff", label: "紫" },
  slate: { bg: "#5b6474", fg: "#ffffff", label: "墨" },
};

export function groupColor(color: string | null | undefined) {
  return MAP[(color as GroupColor) ?? "indigo"] ?? MAP.indigo;
}

// Deterministic avatar color for people without a photo.
const PERSON = ["#5b6ee0", "#2f8fd8", "#18a0a0", "#3aa064", "#d39a1b", "#e0733a", "#d6507a", "#8b62d6"];
export function personColor(id: string | null | undefined): string {
  if (!id) return "#8e8e95";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PERSON[h % PERSON.length];
}
