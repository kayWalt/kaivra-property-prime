import { supabase } from "@/integrations/supabase/client";

export type InspectionStatus =
  | "requested"
  | "confirmed"
  | "rescheduled"
  | "completed"
  | "cancelled"
  | "no_show";

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  rescheduled: "Rescheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

export const INSPECTION_STATUSES = Object.keys(INSPECTION_STATUS_LABEL) as InspectionStatus[];

export const ACTIVE_INSPECTION_STATUSES: InspectionStatus[] = ["requested", "confirmed", "rescheduled"];

/** Inspections run hourly between 09:00 and 16:00, project local time. */
export const INSPECTION_SLOTS = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
] as const;

/** Inspections cannot be cancelled or rescheduled inside this window. */
export const INSPECTION_LOCK_HOURS = 24;

export const INSPECTION_SELECT =
  "id, reference, status, scheduled_date, scheduled_time, duration_minutes, attendee_count, phone, email, notes, admin_note, assigned_adviser, investor_id, application_id, project_id, property_id, created_at, confirmed_at, completed_at, cancelled_at, projects(name, location), properties(name, property_type, size_label), applications(reference)";

/** Local calendar date (no UTC shift) as YYYY-MM-DD. */
export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatSlot(time: string | null | undefined) {
  if (!time) return "—";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? "00"} ${suffix}`;
}

export function inspectionDateTime(date: string, time: string) {
  return new Date(`${date}T${(time ?? "00:00").slice(0, 5)}:00`);
}

export function isUpcoming(status: InspectionStatus, date: string, time: string) {
  return (
    ACTIVE_INSPECTION_STATUSES.includes(status) && inspectionDateTime(date, time).getTime() >= Date.now()
  );
}

export function canInvestorChange(status: InspectionStatus, date: string, time: string) {
  if (!ACTIVE_INSPECTION_STATUSES.includes(status)) return false;
  const diff = inspectionDateTime(date, time).getTime() - Date.now();
  return diff > INSPECTION_LOCK_HOURS * 60 * 60 * 1000;
}

/** Slots already taken by an active booking for this project and date. */
export async function fetchTakenSlots(projectId: string, date: string) {
  const { data, error } = await supabase
    .from("inspection_appointments")
    .select("scheduled_time")
    .eq("project_id", projectId)
    .eq("scheduled_date", date)
    .in("status", ACTIVE_INSPECTION_STATUSES);
  if (error) throw error;
  return new Set((data ?? []).map((r) => String(r.scheduled_time).slice(0, 5)));
}

export function inspectionTone(status: InspectionStatus): "neutral" | "gold" | "emerald" | "red" {
  switch (status) {
    case "confirmed":
    case "completed":
      return "emerald";
    case "cancelled":
    case "no_show":
      return "red";
    case "rescheduled":
      return "gold";
    default:
      return "gold";
  }
}
