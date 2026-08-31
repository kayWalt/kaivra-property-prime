import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteApplication } from "@/lib/applications.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentBadge } from "@/components/kaivra/StatusBadge";
import { ApplicationDetailView } from "./applications.$appId";
import { useRoles, useSession, primaryRole, isStaffRole } from "@/hooks/useAuth";
import { fetchPayments, logEvent, notify } from "@/lib/applications";
import { APPLICATION_STATUSES, STATUS_LABEL, formatNaira, type ApplicationStatus } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/admin/applications/$appId")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Review Application" },
      { name: "description", content: "Review an investor application, verify payments and update its status." },
      { property: "og:title", content: "KAIVRA | Review Application" },
      { property: "og:description", content: "Review an investor application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManageApplication,
});

function ManageApplication() {
  const { appId } = Route.useParams();
  const { user } = useSession();
  const { data: roles, isLoading } = useRoles(user?.id);
  const staff = isStaffRole(primaryRole(roles));
  const admin = (roles ?? []).some((r) => r === "admin" || r === "super_admin");
  const navigate = useNavigate();
  const removeApplication = useServerFn(deleteApplication);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const application = useQuery({
    queryKey: ["application-status", appId],
    enabled: staff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id, reference, status, investor_id")
        .eq("id", appId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const payments = useQuery({
    queryKey: ["payments", appId],
    enabled: staff,
    queryFn: () => fetchPayments(appId),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-3xl">Restricted area</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have permission to view this application.</p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Return to dashboard</Link>
        </Button>
      </div>
    );
  }

  async function updateStatus(next: ApplicationStatus) {
    setBusy(true);
    const { error } = await supabase
      .from("applications")
      .update({ status: next, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", appId);
    setBusy(false);
    if (error) {
      toast.error("The status could not be updated. Please try again.");
      return;
    }
    toast.success(`Status updated to ${STATUS_LABEL[next]}.`);
    void logEvent(appId, "status_changed", `Status set to ${STATUS_LABEL[next]}`);
    if (application.data?.investor_id) {
      void notify(
        application.data.investor_id,
        `Application ${STATUS_LABEL[next]}`,
        `Your application ${application.data.reference ?? ""} is now ${STATUS_LABEL[next].toLowerCase()}.`,
        `/applications/${appId}`,
      );
    }
    void application.refetch();
  }

  async function verifyPayment(paymentId: string, amount: number | string) {
    const { error } = await supabase
      .from("application_payments")
      .update({ status: "verified", verified_by: user?.id ?? null, verified_at: new Date().toISOString() })
      .eq("id", paymentId);
    if (error) {
      toast.error("This payment could not be verified. Please try again.");
      return;
    }
    toast.success("Payment verified.");
    void logEvent(appId, "payment_verified", `${formatNaira(amount)} verified`);
    if (application.data?.investor_id) {
      void notify(
        application.data.investor_id,
        "Payment verified",
        `Your payment of ${formatNaira(amount)} has been verified.`,
        `/applications/${appId}`,
      );
    }
    void payments.refetch();
  }

  async function rejectPayment(paymentId: string) {
    if (!reason.trim()) {
      toast.error("Please provide a reason for rejecting this payment.");
      return;
    }
    const { error } = await supabase
      .from("application_payments")
      .update({
        status: "rejected",
        rejection_reason: reason.trim(),
        verified_by: user?.id ?? null,
        verified_at: new Date().toISOString(),
      })
      .eq("id", paymentId);
    if (error) {
      toast.error("This payment could not be rejected. Please try again.");
      return;
    }
    void logEvent(appId, "payment_rejected", reason.trim());
    if (application.data?.investor_id) {
      void notify(
        application.data.investor_id,
        "Payment rejected",
        reason.trim(),
        `/applications/${appId}`,
      );
    }
    setRejecting(null);
    setReason("");
    void payments.refetch();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await removeApplication({ data: { applicationId: appId } });
      toast.success("Application deleted.");
      void navigate({ to: "/admin" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The application could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="mb-6 print:hidden">
        <Link to="/admin">← All applications</Link>
      </Button>

      <ApplicationDetailView appId={appId} manage />

      <section className="mt-8 rounded-lg border border-border bg-card p-5 print:hidden">
        <h2 className="font-display text-2xl">Payment verification</h2>
        {payments.data?.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No payment records to verify.</p>
        ) : null}
        <ul className="mt-4 space-y-3">
          {payments.data?.map((payment) => (
            <li key={payment.id} className="rounded-md border border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{formatNaira(payment.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {payment.bank ?? "—"} · {payment.reference ?? "no reference"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentBadge status={payment.status as "pending" | "verified" | "rejected"} />
                  {payment.status !== "verified" ? (
                    <AsyncButton size="sm" pendingLabel="Verifying…" onClick={() => verifyPayment(payment.id, payment.amount)}>
                      <Check className="mr-1.5 size-4" /> Verify
                    </AsyncButton>
                  ) : null}
                  {payment.status !== "rejected" ? (
                    <Button size="sm" variant="outline" onClick={() => setRejecting(payment.id)}>
                      <X className="mr-1.5 size-4" /> Reject
                    </Button>
                  ) : null}
                </div>
              </div>
              {rejecting === payment.id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason, e.g. Proof of payment is unclear."
                    className="max-w-md"
                    aria-label="Rejection reason"
                  />
                  <AsyncButton size="sm" variant="destructive" pendingLabel="Rejecting…" onClick={() => rejectPayment(payment.id)}>
                    Confirm rejection
                  </AsyncButton>
                  <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                    Cancel
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5 print:hidden">
        <h2 className="font-display text-2xl">Application status</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {APPLICATION_STATUSES.filter(
            (s) => s !== "draft" && (admin || (s !== "approved" && s !== "rejected")),
          ).map((s) => (
            <AsyncButton
              key={s}
              size="sm"
              disabled={application.data?.status === s}
              variant={application.data?.status === s ? "default" : "outline"}
              onClick={() => updateStatus(s)}
            >
              {STATUS_LABEL[s]}
            </AsyncButton>
          ))}
        </div>
      </section>

      {admin ? (
        <section className="mt-6 rounded-lg border border-destructive/30 bg-card p-5 print:hidden">
          <h2 className="font-display text-2xl">Delete application</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Permanently remove this submission along with its payments, documents and history. Only
            administrators can do this, and it cannot be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="mt-4" disabled={deleting}>
                <Trash2 className="mr-1.5 size-4" />
                {deleting ? "Deleting…" : "Delete application"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this application?</AlertDialogTitle>
                <AlertDialogDescription>
                  {application.data?.reference ?? "This submission"} and all of its payments,
                  uploaded documents and history will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleDelete()}>
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      ) : null}
    </div>
  );
}
