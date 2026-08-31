import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PaymentBadge } from "@/components/kaivra/StatusBadge";
import { openDocument } from "@/components/kaivra/FileUpload";
import { fetchApplication, fetchDocuments, fetchEvents, fetchPayments, logEvent, totals } from "@/lib/applications";

import { formatDate, formatNaira, type ApplicationStatus } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/applications/$appId")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Application Details" },
      { name: "description", content: "Review your investment application, payments and documents." },
      { property: "og:title", content: "KAIVRA | Application Details" },
      { property: "og:description", content: "Your investment application details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-3xl">Application not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This application does not exist, or you do not have permission to view it.
      </p>
      <Button asChild className="mt-6">
        <Link to="/dashboard">Return to dashboard</Link>
      </Button>
    </div>
  ),
  component: ApplicationDetail,
});

export function ApplicationDetailView({ appId, manage }: { appId: string; manage?: boolean }) {
  const [downloading, setDownloading] = useState(false);

  const app = useQuery({ queryKey: ["application", appId], queryFn: () => fetchApplication(appId) });
  const payments = useQuery({ queryKey: ["payments", appId], queryFn: () => fetchPayments(appId) });
  const documents = useQuery({ queryKey: ["documents", appId], queryFn: () => fetchDocuments(appId) });
  const events = useQuery({ queryKey: ["events", appId], queryFn: () => fetchEvents(appId), enabled: !!manage });

  if (app.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (app.isError || !app.data) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <h2 className="font-display text-2xl">Application not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this application, or it no longer exists.
        </p>
      </div>
    );
  }

  const record = app.data;
  const investment = (record.investment ?? {}) as { total_value?: number; units?: number; payment_plan?: string };
  const personal = (record.personal ?? {}) as Record<string, string>;
  const contact = (record.contact ?? {}) as Record<string, string>;
  const totalValue = Number(investment.total_value ?? 0);
  const { paid, outstanding } = totals(payments.data ?? [], totalValue);
  const docs = documents.data ?? [];

  // A form with no project/property selection and no investment value is
  // "empty" — block PDF download and guide the investor back to the wizard.
  const isIncomplete =
    record.status === "draft" || !record.project_id || !record.property_id || totalValue <= 0;

  async function handleDownload() {
    if (isIncomplete) {
      toast.error("Complete and submit your application before downloading the PDF.");
      return;
    }
    setDownloading(true);
    try {
      const { downloadApplicationPdf } = await import("@/lib/pdf");
      await downloadApplicationPdf({
        application: record as never,
        payments: (payments.data ?? []) as never,
        documents: docs as never,
        investorName: personal['full_name'] ?? "Investor",
      });
      void logEvent(appId, "pdf_downloaded", `PDF downloaded for ${record.reference ?? "draft"}`);
    } catch {
      toast.error("The PDF could not be generated. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4 print:block">
        <div>
          <p className="eyebrow text-primary">{record.reference ?? "Draft application"}</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">{record.projects?.name ?? "Project pending"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.properties?.name ?? "Property not selected"} · submitted {formatDate(record.submitted_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <StatusBadge status={record.status as ApplicationStatus} />
          <AsyncButton
            variant="outline"
            onClick={() => handleDownload()}
            disabled={downloading || isIncomplete}
            pendingLabel="Preparing PDF…"
            title={isIncomplete ? "Complete and submit the application first" : undefined}
          >
            <Download className="mr-2 size-4" />
            Download PDF
          </AsyncButton>
          {manage ? (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" /> Print
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Total investment", formatNaira(totalValue)],
          ["Total paid", formatNaira(paid)],
          ["Outstanding", formatNaira(outstanding)],
        ].map(([label, value], index) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p className={`mt-2 font-display text-2xl ${index === 1 ? "text-primary" : ""}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-2xl">Investor</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["Full name", personal['full_name']],
            ["Date of birth", formatDate(personal['date_of_birth'])],
            ["Occupation", personal['occupation']],
            ["Phone", contact['phone']],
            ["Email", contact['email']],
            ["Residential address", personal['residential_address']],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="eyebrow text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="payments" className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Payments</h2>
          {manage ? null : (
            <AddPaymentDialog
              applicationId={appId}
              projectId={record.project_id}
              reference={record.reference}
              onDone={() => {
                void payments.refetch();
                void documents.refetch();
              }}
            />
          )}
        </div>
        {payments.data?.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No payment records yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {payments.data?.map((payment, index) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
              >
                <div>
                  <p className="eyebrow text-muted-foreground">Payment {String(index + 1).padStart(2, "0")}</p>
                  <p className="mt-1 text-sm font-semibold">{formatNaira(payment.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(payment.paid_on)} · {payment.bank ?? "—"} · {payment.reference ?? "no reference"}
                  </p>
                  {payment.status === "rejected" && payment.rejection_reason ? (
                    <p className="mt-1 text-xs text-destructive">{payment.rejection_reason}</p>
                  ) : null}
                </div>
                <PaymentBadge status={payment.status as "pending" | "verified" | "rejected"} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5 print:hidden">
        <h2 className="font-display text-2xl">Documents</h2>
        {docs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No documents uploaded.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm">
                  <span className="font-medium capitalize">{doc.kind.replace(/_/g, " ")}</span>
                  <span className="ml-2 text-muted-foreground">{doc.file_name}</span>
                </span>
                <AsyncButton variant="ghost" size="sm" pendingLabel="Opening…" onClick={() => openDocument(doc.id)}>
                  <Eye className="mr-2 size-4" /> View
                </AsyncButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manage ? (
        <section className="rounded-lg border border-border bg-card p-5 print:hidden">
          <h2 className="font-display text-2xl">Audit history</h2>
          {events.data?.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No recorded activity.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {events.data?.map((event) => (
                <li key={event.id} className="text-sm">
                  <span className="font-medium capitalize">{event.action.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {event.actor_name ?? "system"} · {formatDate(event.created_at)}
                  </span>
                  {event.detail ? <p className="text-xs text-muted-foreground">{event.detail}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function ApplicationDetail() {
  const { appId } = Route.useParams();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="mb-6 print:hidden">
        <Link to="/applications">← All applications</Link>
      </Button>
      <ApplicationDetailView appId={appId} />
    </div>
  );
}
