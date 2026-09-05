import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listPromotions,
  runPromotionCycle,
  savePromotion,
  setPromotionStatus,
} from "@/lib/email.functions";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/kaivra";

const AUDIENCES = [
  { value: "opted_in_investors", label: "All opted-in investors" },
  { value: "property_related", label: "Investors on a related property" },
  { value: "outstanding_balance", label: "Investors with an outstanding balance" },
] as const;

const EMPTY = {
  title: "",
  subject: "",
  description: "",
  cta_label: "",
  cta_url: "",
  image_url: "",
  starts_at: "",
  ends_at: "",
  audience: "opted_in_investors" as (typeof AUDIENCES)[number]["value"],
};

/**
 * Super Admin promotion lifecycle. Promotions only reach investors who have
 * opted in to promotions; nothing is sent until a promotion becomes active,
 * and each recipient is queued once through the shared outbox.
 */
export function PromotionsPanel() {
  const load = useServerFn(listPromotions);
  const save = useServerFn(savePromotion);
  const setStatus = useServerFn(setPromotionStatus);
  const runCycle = useServerFn(runPromotionCycle);
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY });

  const promos = useQuery({
    queryKey: ["promotions"],
    queryFn: () => load({ data: undefined as never }),
  });

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function create(status: "draft" | "scheduled") {
    await save({
      data: {
        title: form.title,
        subject: form.subject || form.title,
        description: form.description,
        cta_label: form.cta_label || null,
        cta_url: form.cta_url || null,
        image_url: form.image_url || null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        audience: form.audience,
        status,
      },
    });
    setForm({ ...EMPTY });
    await qc.invalidateQueries({ queryKey: ["promotions"] });
    toast.success(status === "draft" ? "Promotion saved as a draft." : "Promotion scheduled.");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New promotion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="promo-title">Title</Label>
              <Input
                id="promo-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="promo-subject">Email subject</Label>
              <Input
                id="promo-subject"
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="promo-body">Description</Label>
            <Textarea
              id="promo-body"
              rows={5}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="promo-cta">Button label</Label>
              <Input
                id="promo-cta"
                value={form.cta_label}
                onChange={(e) => set("cta_label", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="promo-url">Button link</Label>
              <Input
                id="promo-url"
                placeholder="https://kaivraa.com/projects"
                value={form.cta_url}
                onChange={(e) => set("cta_url", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="promo-start">Starts</Label>
              <Input
                id="promo-start"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="promo-end">Ends</Label>
              <Input
                id="promo-end"
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => set("ends_at", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Audience</Label>
            <Select
              value={form.audience}
              onValueChange={(v) => set("audience", v as typeof form.audience)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <AsyncButton variant="outline" onClick={() => create("draft")}>
              Save draft
            </AsyncButton>
            <AsyncButton onClick={() => create("scheduled")}>Schedule</AsyncButton>
            <AsyncButton
              variant="ghost"
              onClick={async () => {
                const res = await runCycle({ data: undefined as never });
                await qc.invalidateQueries({ queryKey: ["promotions"] });
                toast.success(
                  `Activated ${res.activated}, queued ${res.queued}, expired ${res.expired}.`,
                );
              }}
            >
              Run promotion cycle now
            </AsyncButton>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {promos.data?.length === 0 ? (
          <EmptyState title="No promotions yet." body="Create one above to get started." />
        ) : null}
        {(promos.data ?? []).map((promo: any) => (
          <article key={promo.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{promo.title}</h3>
              <Badge variant="outline">{promo.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{promo.subject}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {promo.audience} · queued {promo.queued_count ?? 0}
              {promo.starts_at ? ` · from ${formatDate(promo.starts_at)}` : ""}
              {promo.ends_at ? ` · until ${formatDate(promo.ends_at)}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {promo.status !== "cancelled" && promo.status !== "expired" ? (
                <AsyncButton
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await setStatus({ data: { id: promo.id, status: "cancelled" } });
                    await qc.invalidateQueries({ queryKey: ["promotions"] });
                    toast.success("Promotion cancelled.");
                  }}
                >
                  Cancel
                </AsyncButton>
              ) : null}
              {promo.status === "draft" ? (
                <AsyncButton
                  size="sm"
                  onClick={async () => {
                    await setStatus({ data: { id: promo.id, status: "scheduled" } });
                    await qc.invalidateQueries({ queryKey: ["promotions"] });
                    toast.success("Promotion scheduled.");
                  }}
                >
                  Schedule
                </AsyncButton>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
