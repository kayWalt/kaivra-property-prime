import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAYMENT_METHODS = ["bank_transfer", "bank_deposit", "pos", "cash", "other"] as const;

/**
 * Records a subsequent payment against an EXISTING investment.
 *
 * The application (investment) is the parent record and is never created or
 * modified here — only a new payment row is added. Ownership is decided by the
 * database from the caller's own session: the insert runs through the caller's
 * RLS-scoped client, whose policy requires `can_view_application`, so an
 * investor can never attach a payment to somebody else's investment even if
 * the browser sends a different application id.
 */
export const submitInvestmentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        applicationId: z.string().uuid(),
        amount: z.number().positive().finite().max(1_000_000_000_000),
        paidOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish(),
        method: z.enum(PAYMENT_METHODS),
        bank: z.string().max(120).nullish(),
        sender: z.string().max(120).nullish(),
        reference: z.string().max(120).nullish(),
        note: z.string().max(1000).nullish(),
        paymentAccountId: z.string().uuid().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // 1. Ownership / existence. RLS decides what this caller may see.
    const { data: application, error: appError } = await context.supabase
      .from("applications")
      .select("id, status, reference, project_id, investor_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appError) throw new Error("This investment could not be verified. Please try again.");
    if (!application) throw new Error("You do not have permission to pay for this investment.");
    // Ownership, not role. Staff can *see* every investment, so visibility alone
    // is not enough here: only the investor the investment belongs to may record
    // a payment through this endpoint — including when that person is also an
    // admin, adviser or partner. Reviewing/verifying payments stays untouched.
    if (application.investor_id !== context.userId)
      throw new Error("You can only record a payment on your own investment.");
    if (application.status === "draft")
      throw new Error("Finish and submit this investment before recording a payment.");


    const reference = data.reference?.trim() || null;
    const paidOn = data.paidOn || null;

    // 2. Duplicate guard. A repeated submit (double click, retried request) must
    //    not create a second transaction. The database additionally enforces
    //    global uniqueness of bank references.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await context.supabase
      .from("application_payments")
      .select("id, amount, paid_on, reference, created_at, status")
      .eq("application_id", data.applicationId)
      .gte("created_at", since);
    const duplicate = (recent ?? []).find(
      (p) =>
        Number(p.amount) === data.amount &&
        (p.paid_on ?? null) === paidOn &&
        ((p.reference ?? null) === reference || (!reference && !p.reference)),
    );
    if (duplicate)
      throw new Error(
        "This payment has already been submitted. Check your payment history before trying again.",
      );

    // 3. Insert. Status is forced to pending and no verification field is ever
    //    accepted from the browser.
    const { data: payment, error } = await context.supabase
      .from("application_payments")
      .insert({
        application_id: application.id,
        amount: data.amount,
        paid_on: paidOn,
        bank: data.bank?.trim() || null,
        sender: data.sender?.trim() || null,
        reference,
        method: data.method,
        description: data.note?.trim() || null,
        payment_account_id: data.paymentAccountId ?? null,
        status: "pending" as const,
      })
      .select("id, payment_reference, amount, status")
      .single();

    if (error || !payment) {
      const text = `${error?.message ?? ""}`;
      if (
        text.includes("DUPLICATE_PAYMENT_REFERENCE") ||
        text.includes("application_payments_reference_unique_ci") ||
        error?.code === "23505"
      ) {
        throw new Error(
          "Payment reference already exists. This transfer reference has already been submitted and cannot be recorded again.",
        );
      }
      console.error("[submitInvestmentPayment] insert failed", error);
      throw new Error("Your payment could not be recorded. Please try again.");
    }

    return {
      paymentId: payment.id,
      paymentReference: payment.payment_reference,
      applicationReference: application.reference,
      projectId: application.project_id,
    };
  });

/**
 * ADMIN-ASSISTED payment. A deliberately separate door from
 * `submitInvestmentPayment`: staff never pass the investor ownership test on
 * somebody else's investment, so assisting an investor requires an explicit
 * `transactions.create` permission instead. The investor and the investment
 * are both named by the caller and must match server-side, so an administrator
 * cannot silently move a payment onto a different investor's record.
 */
export const recordAssistedPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        investorId: z.string().uuid(),
        applicationId: z.string().uuid(),
        amount: z.number().positive().finite().max(1_000_000_000_000),
        paidOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish(),
        method: z.enum(PAYMENT_METHODS),
        bank: z.string().max(120).nullish(),
        sender: z.string().max(120).nullish(),
        reference: z.string().max(120).nullish(),
        note: z.string().max(1000).nullish(),
        paymentAccountId: z.string().uuid().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // 1. Explicit staff authorisation. Being an admin is not enough on its own:
    //    the caller must hold transactions.create.
    const { assertAdminCan } = await import("@/lib/admin-permissions.server");
    await assertAdminCan(context.supabase as never, context.userId, "transactions", "create");

    // 2. The investment must exist for this caller and belong to the investor
    //    they selected. Nothing about ownership is taken from the browser.
    const { data: application, error: appError } = await context.supabase
      .from("applications")
      .select("id, status, reference, project_id, investor_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appError) throw new Error("This investment could not be verified. Please try again.");
    if (!application) throw new Error("That investment could not be found.");
    if (application.investor_id !== data.investorId)
      throw new Error("That investment does not belong to the selected investor.");
    if (application.status === "draft")
      throw new Error("This investment must be submitted before a payment can be recorded.");

    const reference = data.reference?.trim() || null;
    const paidOn = data.paidOn || null;

    // 3. Same duplicate protection as the investor flow.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await context.supabase
      .from("application_payments")
      .select("id, amount, paid_on, reference, created_at, status")
      .eq("application_id", data.applicationId)
      .gte("created_at", since);
    const duplicate = (recent ?? []).find(
      (p) =>
        Number(p.amount) === data.amount &&
        (p.paid_on ?? null) === paidOn &&
        ((p.reference ?? null) === reference || (!reference && !p.reference)),
    );
    if (duplicate)
      throw new Error(
        "This payment has already been recorded. Check the payment history before trying again.",
      );

    // 4. Child payment only — no application is ever created or modified.
    const { data: payment, error } = await context.supabase
      .from("application_payments")
      .insert({
        application_id: application.id,
        amount: data.amount,
        paid_on: paidOn,
        bank: data.bank?.trim() || null,
        sender: data.sender?.trim() || null,
        reference,
        method: data.method,
        description: data.note?.trim() || null,
        payment_account_id: data.paymentAccountId ?? null,
        status: "pending" as const,
      })
      .select("id, payment_reference, amount, status")
      .single();

    if (error || !payment) {
      const text = `${error?.message ?? ""}`;
      if (
        text.includes("DUPLICATE_PAYMENT_REFERENCE") ||
        text.includes("application_payments_reference_unique_ci") ||
        error?.code === "23505"
      ) {
        throw new Error(
          "Payment reference already exists. This transfer reference has already been submitted and cannot be recorded again.",
        );
      }
      console.error("[recordAssistedPayment] insert failed", error);
      throw new Error("The payment could not be recorded. Please try again.");
    }

    // 5. Audit trail on the existing application history.
    const { data: actor } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: investor } = await context.supabase
      .from("profiles")
      .select("full_name, investor_code")
      .eq("id", data.investorId)
      .maybeSingle();
    const actorName = actor?.full_name ?? actor?.email ?? "KAIVRA staff";

    await context.supabase.from("application_events").insert({
      application_id: application.id,
      actor: context.userId,
      actor_name: actorName,
      action: "assisted_payment_recorded",
      detail: `Payment of ${data.amount} (${payment.payment_reference}) recorded on behalf of ${
        investor?.full_name ?? "investor"
      } (${investor?.investor_code ?? "—"}) by ${actorName}`,
    });

    return {
      paymentId: payment.id,
      paymentReference: payment.payment_reference,
      applicationReference: application.reference,
      projectId: application.project_id,
    };
  });
