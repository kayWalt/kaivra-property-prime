import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider, KAIVRA_CHAT_MODEL } from "@/lib/ai-gateway.server";

/**
 * KAIVRA AI Assist.
 *
 * Public endpoint (unauthenticated visitors get general guidance), but every
 * piece of investor data is read through a Supabase client that carries the
 * caller's own bearer token, so RLS decides what the assistant can see. The
 * service-role key is never used here and the AI never receives raw table
 * dumps — only the narrow tool results below.
 */

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  context: z
    .object({
      route: z.string().max(200).optional(),
      step: z.string().max(60).optional(),
      applicationReference: z.string().max(60).optional(),
      projectName: z.string().max(200).optional(),
      propertyName: z.string().max(200).optional(),
      status: z.string().max(60).optional(),
    })
    .optional(),
});

function supabaseFor(token?: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        if (token) headers.set("Authorization", `Bearer ${token}`);
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const SYSTEM = `You are KAIVRA AI Assist, the customer-support and application assistant for KAIVRA, a real-estate investment management platform ("Smart Real Estate Investment Management").

Identity: always be transparent that you are an AI assistant. Never claim to be a human.

Tone: warm, concise, professional. Short paragraphs, plain language, markdown-free plain text with simple dashes for lists. Never more than ~150 words unless the investor asks for detail.

FACTS RULE (critical): never invent project names, locations, property sizes, prices, unit availability, payment plans, bank details, promotions, returns or timelines. Those facts must come from the tools. If a tool returns nothing, say: "I don't have verified information about that at the moment." and offer to connect the investor with a KAIVRA adviser.

Investor data: only use the tools for the signed-in investor's own applications, payments and inspections. You can never see another investor's data — if asked, decline. If a tool says the user is not signed in, ask them to sign in first.

You cannot approve or reject applications, verify payments, change records, delete anything, or make financial/legal decisions. If asked, reply that the action needs a KAIVRA administrator and suggest the "Talk to a KAIVRA adviser" option in the chat.

Escalate (recommend the human handoff button) when: the investor asks for a human, disputes a payment, wants to change identity/personal records, has a complaint, asks a legal, tax or investment-advice question, or when you are unsure.

KAIVRA knowledge you may explain freely:
- Accounts: email/password or Google sign-in; password reset from the sign-in page. Each investor has a permanent KAIVRA Investor ID (e.g. KVR-I-26-XXXXXX) shown on their dashboard and profile. It identifies them to KAIVRA staff; it is NOT a password and never unlocks the account, so it is safe to share with an authorised KAIVRA adviser or administrator.
- Application wizard steps: 1 Project, 2 Personal, 3 Contact, 4 Investment, 5 Payment, 6 Documents, 7 Review. It autosaves; an unfinished application can be continued later from "My Applications".
- Field guidance: Full name must match official ID. "Sender" is the name on the account the payment came from. "Bank" is the bank the payment was sent from or deposited into. "Initial deposit" is the amount already paid. "Proof of payment" is a clear bank transfer receipt or deposit slip. A passport photograph and a signature are required; a valid ID and proof of payment are recommended.
- Payments: investors upload proof of payment; KAIVRA staff verify it. Verified payments count towards the amount paid; the outstanding balance is the total investment value minus verified payments.
- Inspections: an investor requests a site inspection with a date and time; staff confirm it and the investor receives a notification and a KVR-S reference.
- Statuses: Draft (still editable), Submitted (received), Under Review (staff checking), Payment Verification (payment being confirmed), Approved (accepted), Requires Correction (something must be fixed and resubmitted), Rejected (not accepted).
- References: applications KVR-A-…, payments KVR-P-…, inspections KVR-S-…, support requests KVR-SUP-….`;

async function handler({ request }: { request: Request }) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return new Response("Invalid request", { status: 400 });
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return new Response("KAIVRA AI Assist is not configured.", { status: 503 });

  const authHeader = request.headers.get("authorization") ?? "";
  const token =
    authHeader.startsWith("Bearer ") && authHeader.slice(7).split(".").length === 3
      ? authHeader.slice(7)
      : undefined;

  const supabase = supabaseFor(token);

  const { data: settings } = await supabase
    .from("ai_settings")
    .select("enabled")
    .maybeSingle();
  if (settings && settings.enabled === false) {
    return new Response("KAIVRA AI Assist is currently switched off.", { status: 503 });
  }

  let userId: string | null = null;
  if (token) {
    const { data } = await supabase.auth.getClaims(token);
    userId = (data?.claims?.sub as string | undefined) ?? null;
  }

  const gateway = createLovableAiGatewayProvider(apiKey);

  const requireUser = () =>
    userId ? null : { error: "The investor is not signed in. Ask them to sign in first." };

  const tools = {
    list_projects: tool({
      description:
        "List the real-estate projects KAIVRA currently offers, with location and description.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from("projects")
          .select("name, location, description, project_code, currency, payment_plans")
          .eq("is_active", true)
          .order("created_at");
        return { projects: data ?? [] };
      },
    }),
    list_properties: tool({
      description:
        "List the properties (type, size, price, units available) for a KAIVRA project. Use when asked about sizes, plots, duplexes or prices.",
      inputSchema: z.object({
        projectName: z.string().nullable(),
      }),
      execute: async ({ projectName }) => {
        let query = supabase
          .from("properties")
          .select(
            "name, property_type, size_label, unit_price, units_available, payment_plan, description, projects(name, location)",
          )
          .eq("is_active", true)
          .order("unit_price");
        if (projectName) {
          const { data: project } = await supabase
            .from("projects")
            .select("id")
            .ilike("name", `%${projectName}%`)
            .limit(1)
            .maybeSingle();
          if (project?.id) query = query.eq("project_id", project.id);
        }
        const { data } = await query.limit(30);
        return { currency: "NGN", properties: data ?? [] };
      },
    }),
    my_applications: tool({
      description:
        "The signed-in investor's own applications: reference, status, project, property and investment value.",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = requireUser();
        if (denied) return denied;
        const { data } = await supabase
          .from("applications")
          .select(
            "reference, status, current_step, investment, submitted_at, created_at, projects(name), properties(name, size_label, unit_price)",
          )
          .eq("investor_id", userId!)
          .order("created_at", { ascending: false })
          .limit(10);
        return { applications: data ?? [] };
      },
    }),
    my_payments: tool({
      description:
        "The signed-in investor's own payment records and totals (paid vs pending vs outstanding).",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = requireUser();
        if (denied) return denied;
        const { data: apps } = await supabase
          .from("applications")
          .select("id, reference, investment")
          .eq("investor_id", userId!);
        const ids = (apps ?? []).map((a) => a.id);
        if (ids.length === 0) return { payments: [], totals: null };
        const { data: payments } = await supabase
          .from("application_payments")
          .select("payment_reference, amount, status, method, paid_on, application_id")
          .in("application_id", ids)
          .order("created_at", { ascending: false })
          .limit(40);
        const invested = (apps ?? []).reduce(
          (sum, a) => sum + Number((a.investment as { total_value?: number })?.total_value ?? 0),
          0,
        );
        const verified = (payments ?? [])
          .filter((p) => p.status === "verified")
          .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
        const pending = (payments ?? [])
          .filter((p) => p.status === "pending")
          .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
        return {
          currency: "NGN",
          totals: { invested, verifiedPaid: verified, pending, outstanding: invested - verified },
          payments: (payments ?? []).map(({ application_id, ...rest }) => ({
            ...rest,
            application: (apps ?? []).find((a) => a.id === application_id)?.reference ?? null,
          })),
        };
      },
    }),
    my_inspections: tool({
      description: "The signed-in investor's own site inspection appointments and their status.",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = requireUser();
        if (denied) return denied;
        const { data } = await supabase
          .from("inspection_appointments")
          .select("reference, status, scheduled_date, scheduled_time, notes, projects(name)")
          .eq("investor_id", userId!)
          .order("scheduled_date", { ascending: false })
          .limit(10);
        return { inspections: data ?? [] };
      },
    }),
  };

  const ctx = body.context;
  const contextLine = ctx
    ? `Current app context (safe, minimal): page ${ctx.route ?? "unknown"}${
        ctx.step ? `, wizard step "${ctx.step}"` : ""
      }${ctx.projectName ? `, project "${ctx.projectName}"` : ""}${
        ctx.propertyName ? `, property "${ctx.propertyName}"` : ""
      }${ctx.status ? `, application status "${ctx.status}"` : ""}${
        ctx.applicationReference ? `, application ${ctx.applicationReference}` : ""
      }.`
    : "";

  const result = streamText({
    model: gateway(KAIVRA_CHAT_MODEL),
    system: `${SYSTEM}\n\nThe investor is ${userId ? "signed in" : "NOT signed in (public visitor)"}.\n${contextLine}`,
    messages: body.messages,
    tools,
    stopWhen: stepCountIs(6),
  });

  return result.toTextStreamResponse({
    headers: { "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/ai-chat")({
  server: { handlers: { POST: handler } },
});
