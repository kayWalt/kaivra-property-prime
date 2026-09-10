import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { recordAssistedPayment, submitInvestmentPayment } from "@/lib/payments.functions";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadDocument } from "@/components/kaivra/FileUpload";
import {
  DUPLICATE_REFERENCE_MESSAGE,
  isDuplicateReferenceError,
  logEvent,
  notifyStaffForProject,
} from "@/lib/applications";
import { accountLabel, useActivePaymentAccounts } from "@/lib/payment-accounts";
import { PAYMENT_METHODS, formatNaira, type PaymentMethod } from "@/lib/kaivra";

function sanitizeAmount(value: string): string {
  const digitsAndDot = value.replace(/[^\d.]/g, "");
  const parts = digitsAndDot.split(".");
  if (parts.length <= 2) return digitsAndDot;
  return parts[0] + "." + parts.slice(1).join("");
}

function formatAmountDisplay(raw: string): string {
  if (!raw) return "";
  const [intPart, ...rest] = raw.split(".");
  const integer = BigInt((intPart ?? "") || "0").toLocaleString("en-US");
  if (rest.length === 0) return integer;
  return `${integer}.${rest.join("")}`;
}

function positionAfterDigits(formatted: string, targetDigits: number): number {
  if (targetDigits <= 0) return 0;
  let digits = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted.charAt(i))) {
      digits++;
      if (digits === targetDigits) return i + 1;
    }
  }
  return formatted.length;
}

/**
 * Lets an investor record a payment and attach the bank receipt / proof of
 * payment on an application, including after submission.
 */
export function AddPaymentDialog({
  applicationId,
  projectId,
  reference,
  onDone,
  triggerLabel = "Make payment",
  triggerSize = "sm",
  triggerVariant = "outline",
  outstanding,
  assistedInvestorId = null,
}: {
  applicationId: string;
  projectId?: string | null;
  reference?: string | null;
  onDone: () => void;
  triggerLabel?: string;
  triggerSize?: "sm" | "default" | "lg";
  triggerVariant?: "outline" | "default";
  outstanding?: number;
  /**
   * Staff mode. When set, the payment is recorded on behalf of this investor
   * through the separately authorised admin operation; the investor
   * self-service endpoint is never used and never relaxed.
   */
  assistedInvestorId?: string | null;
}) {
  const assisted = !!assistedInvestorId;
  const submitPayment = useServerFn(submitInvestmentPayment);
  const submitAssisted = useServerFn(recordAssistedPayment);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [bank, setBank] = useState("");
  const [sender, setSender] = useState("");
  const [payRef, setPayRef] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const accounts = useActivePaymentAccounts();

  function reset() {
    setAmount("");
    setPaidOn("");
    setBank("");
    setSender("");
    setPayRef("");
    setMethod("bank_transfer");
    setNote("");
    setFile(null);
    setAccountId("");
  }


  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the amount you paid.");
      return;
    }
    if (!file) {
      toast.error("Attach your receipt or proof of payment.");
      return;
    }
    const hasAccounts = (accounts.data ?? []).length > 0;
    if (hasAccounts && !accountId) {
      toast.error("Select the account you paid into.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      // The server re-checks that this investment belongs to the signed-in
      // investor, forces the status to pending and blocks duplicates. The
      // browser never writes the payment row itself.
      const payment = assisted
        ? await submitAssisted({
            data: {
              investorId: assistedInvestorId!,
              applicationId,
              amount: value,
              paidOn: paidOn || null,
              bank: bank || null,
              sender: sender || null,
              reference: payRef || null,
              method,
              note: note || null,
              paymentAccountId: accountId || null,
            },
          })
        : await submitPayment({
        data: {
          applicationId,
          amount: value,
          paidOn: paidOn || null,
          bank: bank || null,
          sender: sender || null,
          reference: payRef || null,
          method,
          note: note || null,
          paymentAccountId: accountId || null,
        },
      });

      await uploadDocument({
        applicationId,
        kind: "proof_of_payment",
        file,
        label: `Proof of payment · ${payRef || value}`,
        paymentId: payment.paymentId,
      });

      void logEvent(
        applicationId,
        "payment_proof_uploaded",
        `Payment of ${value} submitted for verification`,
      );
      void notifyStaffForProject(
        projectId ?? null,
        "New payment proof uploaded",
        `An investor uploaded proof of payment for ${reference ?? "an application"}.`,
        `/admin/applications/${applicationId}`,
      );

      toast.success(
        assisted
          ? "Payment recorded for the investor. It is now awaiting verification."
          : "Payment submitted. Our team will verify it shortly.",
      );
      reset();
      setOpen(false);
      onDone();
    } catch (err) {
      if (isDuplicateReferenceError(err)) {
        toast.error(DUPLICATE_REFERENCE_MESSAGE);
        void logEvent(
          applicationId,
          "payment_duplicate_reference_rejected",
          `Duplicate payment reference "${payRef.trim()}" rejected`,
        );
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "Your payment could not be recorded. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size={triggerSize} variant={triggerVariant}>
          <Plus className="mr-2 size-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assisted ? "Record payment for investor" : "Make a payment"}</DialogTitle>
          <DialogDescription>
            {assisted
              ? "You are recording this payment on the investor's behalf. The investment, investor and property stay exactly as they are, and the payment waits for the normal verification step."
              : "Record what you paid on this existing investment and attach the bank receipt. Your investment details stay exactly as they are."}
            {typeof outstanding === "number" && outstanding > 0
              ? ` Outstanding balance: ${formatNaira(outstanding)}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="pay-account">Account paid into</Label>
            <select
              id="pay-account"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={accounts.isLoading}
            >
              <option value="">
                {accounts.isLoading ? "Loading accounts…" : "Select the account you paid into"}
              </option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
            {!accounts.isLoading && (accounts.data ?? []).length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No payment accounts are published yet — please contact your adviser.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">

            <div>
              <Label htmlFor="pay-amount">Amount paid (₦)</Label>
              <Input
                id="pay-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pay-date">Payment date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="pay-bank">Bank</Label>
              <Input id="pay-bank" value={bank} onChange={(e) => setBank(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-method">Method</Label>
              <select
                id="pay-method"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="pay-sender">Sender / depositor</Label>
              <Input id="pay-sender" value={sender} onChange={(e) => setSender(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-ref">Transaction reference</Label>
              <Input id="pay-ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Textarea
              id="pay-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="pay-file">Receipt / proof of payment</Label>
            <Input
              id="pay-file"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? <p className="mt-1 text-xs text-muted-foreground">{file.name}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <AsyncButton onClick={() => submit()} disabled={submitting} pendingLabel="Submitting…">
            Submit payment
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
