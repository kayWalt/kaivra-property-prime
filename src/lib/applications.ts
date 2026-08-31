import { supabase } from "@/integrations/supabase/client";
import type { ApplicationStatus } from "./kaivra";

export const APPLICATION_SELECT =
  "*, projects(id, name, location, hero_image, currency, project_code), properties(id, name, property_type, size_label, unit_price, image_urls, property_code)";

export type ApplicationRow = Awaited<ReturnType<typeof fetchApplication>>;

export async function fetchApplication(id: string) {
  const { data, error } = await supabase
    .from("applications")
    .select(APPLICATION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchPayments(applicationId: string) {
  const { data, error } = await supabase
    .from("application_payments")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchDocuments(applicationId: string) {
  const { data, error } = await supabase
    .from("application_documents")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchEvents(applicationId: string) {
  const { data, error } = await supabase
    .from("application_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function logEvent(
  applicationId: string,
  action: string,
  detail?: string,
  actorName?: string,
) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from("application_events").insert({
      application_id: applicationId,
      actor: auth.user?.id ?? null,
      actor_name: actorName ?? auth.user?.email ?? null,
      action,
      detail: detail ?? null,
    });
  } catch {
    /* audit trail is best-effort: never block the user's action */
  }
}

export async function notify(userId: string, title: string, body: string, link?: string) {
  try {
    await supabase
      .from("notifications")
      .insert({ user_id: userId, title, body, link: link ?? null });
  } catch {
    /* best-effort */
  }
}

/**
 * Fan-out to admins and project advisers. Investors are not allowed to write
 * notifications addressed to other users, so this always goes through the
 * server function — and never throws, so a notification problem can never
 * block the action that triggered it.
 */
export async function notifyStaffForProject(
  projectId: string | null,
  title: string,
  body: string,
  link: string,
) {
  try {
    const { notifyProjectStaff } = await import("./notifications.functions");
    await notifyProjectStaff({ data: { projectId, title, body, link } });
  } catch {
    /* best-effort */
  }
}

export function totals(
  payments: { amount: number | string; status: string }[],
  totalValue: number,
) {
  const paid = payments
    .filter((p) => p.status !== "rejected")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  return { paid, outstanding: Math.max(0, totalValue - paid) };
}

export const EDITABLE_STATUSES: ApplicationStatus[] = ["draft", "requires_correction"];
