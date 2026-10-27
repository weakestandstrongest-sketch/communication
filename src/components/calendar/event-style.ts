import { CalendarDays, Dumbbell, PartyPopper, Tent, Trophy, Users, type LucideIcon } from "lucide-react";
import type { EventCategory } from "@/lib/types";

export const CATEGORY_ICON: Record<EventCategory, LucideIcon> = {
  practice: Dumbbell,
  match: Trophy,
  meeting: Users,
  social: PartyPopper,
  trip: Tent,
  other: CalendarDays,
};
