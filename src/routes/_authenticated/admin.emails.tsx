import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";
import {
  emailSystemStatus,
  listEmailLog,
  queueAnnouncement,
  retryFailedEmails,
  runEmailQueue,
  runPaymentReminderScan,
  sendTestEmail,
} from "@/lib/email.functions";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";

/**
 * Super Admin email console. Ordinary admins, proxy admins and advisers are
 * denied here and again inside every server function.
 */
export const Route = createFileRoute("/_authenticated/admin/emails")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Investor Email Notifications" },
      {
        name: "description",
        content:
          "Super Admin console for KAIVRA investor email notifications, announcements and delivery logs.",
      },
      { property: "og:title", content: "KAIVRA | Investor Email Notifications" },
      {
        property: "og:description",
        content: "Manage KAIVRA investor email notifications and delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminEmailsPage,
});

const STATUS_TONE: Record<string, string> = {
  sent: "default",
  pending: "secondary",
  failed: "destructive",
  skipped: "outline",
  expanded: "outline",
};

function AdminEmailsPage() {
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const isSuperAdmin = primaryRole(roles) === "super_admin";

  const status = useServerFn(emailSystemStatus);
  const logFn = useServerFn(listEmailLog);
  const testFn = useServerFn(sendTestEmail);
  const announceFn = useServerFn(queueAnnouncement);
  const runFn = useServerFn(runEmailQueue);
  const scanFn = useServerFn(runPaymentReminderScan);
  const retryFn = useServerFn(retryFailedEmails);
  const qc = useQueryClient();

  const [filter, setFilter] = useState<
    "all" | "pending" | "sent" | "failed" | "skipped" | "expanded"
  >("all");
  const [form, setForm] = useState({
    subject: "",
    heading: "",
    body: "",
    cta_label: "",
    cta_url: "",
    audience: "investors" as "investors" | "applicants" | "outstanding_balance",
    category: "marketing" as "marketing" | "transactional",
  });

  const statusQuery = useQuery({
    queryKey: ["email-status"],
    queryFn: () => status({ data: undefined as never }),
    enabled: isSuperAdmin,
  });
  const logQuery = useQuery({
    queryKey: ["email-log", filter],
    queryFn: () => logFn({ data: { status: filter, limit: 100 } }),
    enabled: isSuperAdmin,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["email-status"] });
    void qc.invalidateQueries({ queryKey: ["email-log"] });
  };

  if (!isSuperAdmin) {
    return (
      <EmptyState
        title="Access restricted"
        description="Investor email notifications are a KAIVRA Super Admin function."
      />
    );
  }

  const cfg = statusQuery.data?.config;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Investor Email Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Send, schedule and monitor every email KAIVRA delivers to investors.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" aria-hidden /> Delivery configuration
          </CardTitle>
          <AsyncButton variant="outline" size="sm" onClick={async () => refresh()}>
            <RefreshCw className="mr-2 size-4" aria-hidden /> Refresh
          </AsyncButton>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {statusQuery.isLoading ? (
            <Skeleton className="h-20 sm:col-span-2" />
          ) : (
            <>
              <div className="flex items-center gap-2">
                Provider:
                <Badge variant={cfg?.configured ? "default" : "destructive"}>
                  {cfg?.configured ? "Connected" : "Not configured"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                Mode:
                <Badge variant={cfg?.testMode ? "secondary" : "default"}>
                  {cfg?.testMode ? "Test mode — no investor is emailed" : "Live sending"}
                </Badge>
              </div>
              <div className="text-muted-foreground">Sender: {cfg?.from ?? "—"}</div>
              <div className="text-muted-foreground">
                Test recipient: {cfg?.testRecipient ?? "not set"}
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-2 text-muted-foreground">
                {Object.entries(statusQuery.data?.counts ?? {}).map(([k, v]) => (
                  <Badge key={k} variant="outline">
                    {k}: {v}
                  </Badge>
                ))}
              </div>
              {cfg?.testMode ? (
                <p className="sm:col-span-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Test mode is on. Every message is redirected to the configured test address, with
                  the intended recipient shown in the subject line.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">Announcement</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="log">Delivery log</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compose an announcement</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="em-subject">Subject</Label>
                <Input
                  id="em-subject"
                  maxLength={160}
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="em-heading">Heading</Label>
                <Input
                  id="em-heading"
                  maxLength={160}
                  value={form.heading}
                  onChange={(e) => setForm({ ...form, heading: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="em-body">Message</Label>
                <Textarea
                  id="em-body"
                  rows={6}
                  maxLength={5000}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="em-cta">Button label (optional)</Label>
                <Input
                  id="em-cta"
                  maxLength={60}
                  value={form.cta_label}
                  onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="em-cta-url">Button link (optional)</Label>
                <Input
                  id="em-cta-url"
                  placeholder="https://kaivraa.com/projects"
                  value={form.cta_url}
                  onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Audience</Label>
                <Select
                  value={form.audience}
                  onValueChange={(v) => setForm({ ...form, audience: v as typeof form.audience })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investors">All investors</SelectItem>
                    <SelectItem value="applicants">Investors with an active application</SelectItem>
                    <SelectItem value="outstanding_balance">
                      Investors with an outstanding balance
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as typeof form.category })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">
                      Promotional — respects opt-out choices
                    </SelectItem>
                    <SelectItem value="transactional">Service notice — always delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <AsyncButton
                  onClick={async () => {
                    try {
                      const res = await announceFn({
                        data: {
                          ...form,
                          cta_label: form.cta_label || null,
                          cta_url: form.cta_url || null,
                        },
                      });
                      toast.success(
                        `${res.queued} message${res.queued === 1 ? "" : "s"} queued${
                          res.testMode ? " (test mode — nothing reaches investors)" : ""
                        }.`,
                      );
                      refresh();
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "The announcement could not be queued.",
                      );
                    }
                  }}
                  pendingLabel="Queueing…"
                >
                  <Send className="mr-2 size-4" aria-hidden /> Queue announcement
                </AsyncButton>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operations</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <AsyncButton
                variant="outline"
                onClick={async () => {
                  try {
                    await testFn({ data: undefined as never });
                    toast.success("Test email sent to the configured test address.");
                    refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "The test email failed.");
                  }
                }}
                pendingLabel="Sending…"
              >
                <Mail className="mr-2 size-4" aria-hidden /> Send test email
              </AsyncButton>
              <AsyncButton
                variant="outline"
                onClick={async () => {
                  const res = await scanFn({ data: undefined as never });
                  toast.success(`${res.queued} payment reminder(s) queued.`);
                  refresh();
                }}
                pendingLabel="Scanning…"
              >
                Scan for payment reminders
              </AsyncButton>
              <AsyncButton
                onClick={async () => {
                  const res = await runFn({ data: undefined as never });
                  toast.success(
                    `${res.sent} sent, ${res.failed} failed, ${res.skipped} skipped, ${res.expanded} expanded.`,
                  );
                  refresh();
                }}
                pendingLabel="Sending…"
              >
                Process the queue now
              </AsyncButton>
              <AsyncButton
                variant="outline"
                onClick={async () => {
                  const res = await retryFn({ data: undefined as never });
                  toast.success(`${res.requeued} failed message(s) re-queued.`);
                  refresh();
                }}
                pendingLabel="Re-queueing…"
              >
                Retry failed
              </AsyncButton>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-4 space-y-3">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "pending", "sent", "failed", "skipped", "expanded"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s[0]!.toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {logQuery.isLoading ? (
            <Skeleton className="h-64" />
          ) : (logQuery.data ?? []).length === 0 ? (
            <EmptyState title="No messages yet" description="Queued email will appear here." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3">Recipient</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Sent</th>
                    <th className="p-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(logQuery.data ?? []).map((row: any) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="p-3">
                        {row.recipient_email ?? "Broadcast"}
                        {row.test_mode ? (
                          <Badge variant="outline" className="ml-2">
                            test
                          </Badge>
                        ) : null}
                      </td>
                      <td className="p-3">
                        {row.kind.replace(/_/g, " ")}
                        <div className="text-xs text-muted-foreground">{row.category}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant={(STATUS_TONE[row.status] ?? "outline") as any}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {row.last_error ?? row.subject ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
