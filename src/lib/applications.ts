import { supabase } from "@/integrations/supabase/client";
import type { ApplicationStatus } from "./kaivra";

export const APPLICATION_SELECT =
  "*, projects(id, name, location, hero_image, currency), properties(id, name, property_type, size_label, unit_price, image_urls)";

export type ApplicationRow = Awaited<ReturnType<typeof fetchApplication>>;

export async function fetchApplication(id: string) {
  const { data, error } = await supabase.from("applications").select(APPLICATION_SELECT).eq("id", id).maybeSingle();
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

export async function logEvent(applicationId: string, action: string, detail?: string, actorName?: string) {
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("application_events").insert({
    application_id: applicationId,
    actor: auth.user?.id ?? null,
    actor_name: actorName ?? auth.user?.email ?? null,
    action,
    detail: detail ?? null,
  });
}

export async function notify(userId: string, title: string, body: string, link?: string) {
  await supabase.from("notifications").insert({ user_id: userId, title, body, link: link ?? null });
}

export async function notifyStaffForProject(projectId: string | null, title: string, body: string, link: string) {
  const targets = new Set<string>();
  const { data: admins } = await supabase.from("user_roles").select("user_id, role").in("role", ["admin", "super_admin"]);
  admins?.forEach((a) => targets.add(a.user_id));
  if (projectId) {
    const { data: advisers } = await supabase.from("project_advisers").select("adviser_id").eq("project_id", projectId);
    advisers?.forEach((a) => targets.add(a.adviser_id));
  }
  if (targets.size === 0) return;
  await supabase.from("notifications").insert(
    Array.from(targets).map((user_id) => ({ user_id, title, body, link })),
  );
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
