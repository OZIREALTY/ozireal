"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { defineAction } from "./action";
import { todayCardPrefs } from "@/db/schema";

/**
 * Organise the home screen's Do-now cards (owner-approved preview, 2026-11-26).
 * Pin, snooze or hide; "reset" brings every hidden and snoozed card back. Never
 * touches the enquiry, email or task itself.
 */
export const setTodayCard = defineAction({
  input: z.object({
    key: z.string().min(3).max(300),
    pinned: z.boolean().optional(),
    hidden: z.boolean().optional(),
    snoozedUntil: z.union([z.coerce.date(), z.null()]).optional(),
  }),
  async handler(input, ctx) {
    const set = {
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
      ...(input.snoozedUntil !== undefined ? { snoozedUntil: input.snoozedUntil } : {}),
      updatedAt: new Date(),
    };
    await ctx.tx
      .insert(todayCardPrefs)
      .values({ tenantId: ctx.tenantId, key: input.key, ...set })
      .onConflictDoUpdate({ target: [todayCardPrefs.tenantId, todayCardPrefs.key], set });
    revalidatePath("/dashboard");
    return { ok: true };
  },
});

export const resetTodayCards = defineAction({
  input: z.object({}),
  async handler(_input, ctx) {
    await ctx.tx.update(todayCardPrefs).set({ hidden: false, snoozedUntil: null, updatedAt: new Date() }).where(sql`true`);
    revalidatePath("/dashboard");
    return { ok: true };
  },
});
