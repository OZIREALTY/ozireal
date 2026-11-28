"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { defineAction, ActionError } from "./action";
import { users } from "@/db/schema";

/**
 * Set or change your own password from Settings (owner-approved preview, 2026-11-28).
 * Same scrypt hash as scripts/set-password.ts. A change bumps password_set_at, which
 * signs out every OTHER device (auth.ts jwt callback); this device is re-stamped so it
 * stays signed in.
 */
const changeInput = z
    .object({
      current: z.string().max(200).default(""),
      next: z.string().min(12, "Use at least 12 characters").max(200),
      again: z.string().max(200),
    })
    .refine((v) => v.next === v.again, { message: "The two new passwords do not match", path: ["again"] });

export const changePassword = defineAction({
  input: changeInput,
  async handler(input, ctx) {
    const { hashPassword, verifyPassword } = await import("@/server/auth/password");
    const [u] = await ctx.tx
      .select({ id: users.id, hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    if (!u) throw new ActionError("Your user record was not found.");
    if (u.hash) {
      if (!input.current) throw new ActionError("Enter your current password.");
      if (!(await verifyPassword(input.current, u.hash))) throw new ActionError("The current password is not right.");
      if (await verifyPassword(input.next, u.hash)) throw new ActionError("Choose a password different from the current one.");
    }
    const now = new Date();
    await ctx.tx
      .update(users)
      .set({ passwordHash: await hashPassword(input.next), passwordSetAt: now, failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, u.id));
    await ctx.audit({ kind: "edit", action: u.hash ? "Changed their password" : "Set a password", target: "Sign-in", entityType: "user", entityId: u.id });
    // Keep THIS device signed in: its token learns the new time.
    const { unstable_update } = await import("@/auth");
    await unstable_update({ user: { pwAt: now.getTime() } as never });
    return { changedAt: now.toISOString(), wasSet: !!u.hash };
  },
});
