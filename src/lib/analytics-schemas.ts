/**
 * Browser-safe validation shapes for the analytics reads.
 *
 * Shared by the server functions (Cloudflare frontend) and the Lovable Cloud
 * relay endpoint so both sides validate identical input.
 */
import { z } from "zod";

export const rangeSchema = z.object({
  rangeKey: z.enum(["today", "yesterday", "7d", "30d", "90d", "custom"]).default("7d"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const filterSchema = rangeSchema.extend({
  category: z.string().max(30).optional(),
  severity: z.string().max(20).optional(),
  result: z.enum(["success", "failure"]).optional(),
  role: z.string().max(20).optional(),
  search: z.string().trim().max(80).optional(),
  actor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).max(10_000).default(0),
});

export const directorySchema = rangeSchema.extend({
  search: z.string().trim().max(80).optional(),
  onlySignedIn: z.boolean().optional(),
});

export const footprintSchema = z.object({ userId: z.string().uuid() });

export const retentionSchema = z.object({
  visitorRetentionDays: z.number().int().min(7).max(3650).optional(),
  activityRetentionDays: z.number().int().min(30).max(3650).optional(),
  purge: z.boolean().optional(),
});

export const ANALYTICS_OPS = [
  "overview",
  "activityFeed",
  "visitorDirectory",
  "userFootprint",
  "securitySignals",
  "exportCsv",
  "retention",
] as const;
export type AnalyticsOp = (typeof ANALYTICS_OPS)[number];
