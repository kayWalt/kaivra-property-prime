import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoles, useSession, primaryRole, isStaffRole } from "@/hooks/useAuth";
import { formatDate } from "@/lib/kaivra";
import { RequireModule } from "@/components/kaivra/RequireModule";

export const Route = createFileRoute("/_authenticated/admin/enquiries")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Website Enquiries" },
      {
        name: "description",
        content:
          "Review, triage and respond to enquiries submitted through the KAIVRA website.",
      },
      { property: "og:title", content: "KAIVRA | Website Enquiries" },
      { property: "og:description", content: "KAIVRA adviser enquiry workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireModule module="enquiries" allowAdviser>
      <AdminEnquiries />
    </RequireModule>
  ),
});

const STATUSES = ["new", "in_progress", "replied", "closed"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  in_progress: "In progress",
  replied: "Replied",
  closed: "Closed",
};

type Row = {
  id: string;
  reference: string;
  full_name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: Status;
  admin_notes: string | null;
  source_page: string | null;
  created_at: string;
};

function AdminEnquiries() {
  const { user } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const staff = isStaffRole(primaryRole(roles));
  const queryClient = useQueryClient();

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contact-enquiries"],
    enabled: !!user?.id && staff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_enquiries")
        .select(
          "id, reference, full_name, email, phone, subject, message, status, admin_notes, source_page, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.reference, r.full_name, r.email, r.phone, r.subject, r.message]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, term, filter]);

  const active = (data ?? []).find((r) => r.id === openId) ?? null;

  async function save(id: string, patch: { status?: Status; admin_notes?: string }) {
    const { error } = await supabase.from("contact_enquiries").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message || "The enquiry could not be updated.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["contact-enquiries"] });
    toast.success("Enquiry updated.");
  }

  if (rolesLoading || isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!staff) {
    return (
      <EmptyState
        title="Not available"
        body="Website enquiries are only visible to KAIVRA staff."
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl">Website enquiries</h1>
        <p className="text-sm text-muted-foreground">
          Every enquiry submitted through the KAIVRA website contact form.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search reference, name, email or subject"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Status | "all")}>
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No enquiries"
          body="Enquiries submitted through the website will appear here."
        />
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setOpenId(r.id);
                  setNotes(r.admin_notes ?? "");
                }}
                className="w-full rounded-lg border border-border bg-card p-4 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.subject}</span>
                  <Badge variant={r.status === "new" ? "default" : "secondary"}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.full_name} · {r.email}
                  {r.phone ? ` · ${r.phone}` : ""}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.message}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.reference} · {formatDate(r.created_at)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!active} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {active ? (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{active.subject}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  {active.reference} · received {formatDate(active.created_at)}
                  {active.source_page ? ` · from ${active.source_page}` : ""}
                </p>
                <div className="space-y-1">
                  <p className="font-medium">{active.full_name}</p>
                  <a
                    className="flex items-center gap-2 text-primary underline-offset-4 hover:underline"
                    href={`mailto:${active.email}?subject=${encodeURIComponent(
                      `Re: ${active.subject} (${active.reference})`,
                    )}`}
                  >
                    <Mail className="size-4" aria-hidden />
                    {active.email}
                  </a>
                  {active.phone ? (
                    <a
                      className="flex items-center gap-2 text-primary underline-offset-4 hover:underline"
                      href={`tel:${active.phone}`}
                    >
                      <Phone className="size-4" aria-hidden />
                      {active.phone}
                    </a>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap rounded-md bg-muted p-3">{active.message}</p>

                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select
                    value={active.status}
                    onValueChange={(v) => void save(active.id, { status: v as Status })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="enquiry-notes">Internal notes</Label>
                  <Textarea
                    id="enquiry-notes"
                    rows={4}
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <AsyncButton
                    className="justify-self-start"
                    onClick={() => save(active.id, { admin_notes: notes.trim() || "" })}
                  >
                    Save notes
                  </AsyncButton>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
