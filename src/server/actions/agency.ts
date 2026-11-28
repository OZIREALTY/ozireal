"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { defineAction } from "./action";
import { tenants, users } from "@/db/schema";

/**
 * Editable agency details and your own display name (Settings redesign, 2026-11-28).
 * Jurisdiction and time zone stay out: they drive disclosure rules and are a data load,
 * not a form field.
 */
const agencyInput = z.object({
  name: z.string().trim().min(2, "Enter the legal name").max(160),
  tradingName: z.string().trim().max(160).default(""),
  licence: z.string().trim().max(40).default(""),
  abn: z
    .string()
    .trim()
    .max(20)
    .default("")
    .refine((v) => v === "" || /^\d{11}$/.test(v.replace(/\s/g, "")), "An ABN has 11 digits"),
});

export const updateAgency = defineAction({
  input: agencyInput,
  async handler(input, ctx) {
    await ctx.tx
      .update(tenants)
      .set({
        name: input.name,
        tradingName: input.tradingName || null,
        licenceNumber: input.licence || null,
        abn: input.abn ? input.abn.replace(/\s/g, "") : null,
      })
      .where(eq(tenants.id, ctx.tenantId));
    await ctx.audit({ kind: "edit", action: "Updated agency details", target: input.name, entityType: "tenant", entityId: ctx.tenantId });
    revalidatePath("/settings");
    return { ok: true };
  },
});

const nameInput = z.object({ name: z.string().trim().min(2, "Enter your name").max(120) });

export const updateMyName = defineAction({
  input: nameInput,
  async handler(input, ctx) {
    await ctx.tx.update(users).set({ name: input.name }).where(eq(users.id, ctx.userId));
    await ctx.audit({ kind: "edit", action: "Changed their display name", target: input.name, entityType: "user", entityId: ctx.userId });
    revalidatePath("/settings");
    return { ok: true };
  },
});
