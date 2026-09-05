import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteInstallment, listInstallments, saveInstallment } from "@/lib/email.functions";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatMoney } from "@/lib/kaivra";

/**
 * Staff-managed payment schedule for one application.
 *
 * These due dates are the single source of truth for KAIVRA's payment
 * reminders — no reminder is ever sent for an obligation that does not exist
 * here, and reminders stop automatically once an installment is covered by
 * verified payments or marked cancelled.
 */
export function InstallmentSchedule({
  applicationId,
  currency,
}: {
  applicationId: string;
  currency?: string;
}) {
  const load = useServerFn(listInstallments);
  const save = useServerFn(saveInstallment);
  const remove = useServerFn(deleteInstallment);
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");

  const rows = useQuery({
    queryKey: ["installments", applicationId],
    queryFn: () => load({ data: { applicationId } }),
  });

  const list = (rows.data ?? []) as any[];

  async function add() {
    const value = Number(amount);
    if (!label.trim() || !due || !Number.isFinite(value) || value <= 0) {
      toast.error("Enter a name, an amount and a due date.");
      return;
    }
    const sequence = list.reduce((max, r) => Math.max(max, Number(r.sequence ?? 0)), 0) + 1;
    await save({
      data: {
        application_id: applicationId,
        sequence,
        label: label.trim(),
        amount_due: value,
        due_date: due,
        status: "scheduled",
      },
    });
    setLabel("");
    setAmount("");
    setDue("");
    await qc.invalidateQueries({ queryKey: ["installments", applicationId] });
    toast.success("Scheduled payment added.");
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5 print:hidden">
      <h2 className="font-display text-2xl">Payment schedule</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Reminders are sent 14, 7, 3 and 1 day before each due date, on the due date, and again
        after it passes until the amount is covered by verified payments.
      </p>

      <ul className="mt-4 space-y-2">
        {list.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="font-medium">{row.label}</span>
            <span className="text-muted-foreground">
              {formatMoney(Number(row.amount_due), currency)} · due {formatDate(row.due_date)} ·{" "}
              {row.status}
            </span>
            <AsyncButton
              size="sm"
              variant="ghost"
              onClick={async () => {
                await remove({ data: { id: row.id } });
                await qc.invalidateQueries({ queryKey: ["installments", applicationId] });
                toast.success("Scheduled payment removed.");
              }}
            >
              <Trash2 className="size-4" />
            </AsyncButton>
          </li>
        ))}
        {list.length === 0 && !rows.isLoading ? (
          <li className="text-sm text-muted-foreground">
            No scheduled payments yet — add the agreed dates below.
          </li>
        ) : null}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor="inst-label">Payment name</Label>
          <Input
            id="inst-label"
            placeholder="First installment"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="inst-amount">Amount</Label>
          <Input
            id="inst-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="inst-due">Due date</Label>
          <Input
            id="inst-due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
      </div>
      <AsyncButton className="mt-3" onClick={add}>
        Add scheduled payment
      </AsyncButton>
    </section>
  );
}
