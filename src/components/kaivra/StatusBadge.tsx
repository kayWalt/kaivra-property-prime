import { cn } from "@/lib/utils";
import { INSPECTION_STATUS_LABEL, inspectionTone, type InspectionStatus } from "@/lib/inspections";
import { STATUS_LABEL, statusTone, type ApplicationStatus, type PaymentStatus } from "@/lib/kaivra";

const toneClass = {
  neutral: "border-border bg-muted text-muted-foreground",
  gold: "border-gold/40 bg-gold/15 text-gold-foreground",
  emerald: "border-primary/30 bg-primary/10 text-primary",
  red: "border-destructive/30 bg-destructive/10 text-destructive",
};

export type BadgeTone = keyof typeof toneClass;

/** Generic pill used by workflows that define their own status vocabulary. */
export function ToneBadge({
  tone,
  label,
  className,
}: {
  tone: BadgeTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "eyebrow inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        toneClass[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "eyebrow inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        toneClass[statusTone(status)],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const tone = status === "verified" ? "emerald" : status === "rejected" ? "red" : "gold";
  const label =
    status === "verified"
      ? "Verified"
      : status === "rejected"
        ? "Rejected"
        : "Pending Verification";
  return (
    <span
      className={cn(
        "eyebrow inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        toneClass[tone],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function InspectionBadge({ status }: { status: InspectionStatus }) {
  return (
    <span
      className={cn(
        "eyebrow inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        toneClass[inspectionTone(status)],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {INSPECTION_STATUS_LABEL[status]}
    </span>
  );
}
