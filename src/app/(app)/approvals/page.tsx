import { redirect } from "next/navigation";
import { firstWaitingHref } from "@/server/queries/waiting";

export const dynamic = "force-dynamic";

/**
 * The separate approval queue is retired (owner, 2026-11-20: "approval should be through
 * the process"). Email batches are approved on their Review and send screen, single
 * messages on the person's contact page. Old links land on the oldest thing waiting.
 */
export default async function ApprovalsPage() {
  redirect((await firstWaitingHref()) ?? "/campaigns");
}
