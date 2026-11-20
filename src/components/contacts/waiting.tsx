import Link from "next/link";
import { ApprovalActions } from "@/components/forms/approval-actions";
import { EmailFrame } from "@/components/campaigns/review";
import type { waitingFor } from "@/server/queries/waiting";

type Item = Awaited<ReturnType<typeof waitingFor>>[number];

/**
 * Messages to this person waiting for an OK, approved right here (owner, 2026-11-20:
 * approval is part of the process, not a separate queue). A message from an email batch
 * links to that batch's Review and send screen instead.
 */
export function WaitingForContact({ items, name }: { items: Item[]; name: string }) {
  if (!items.length) return null;
  return (
    <section id="waiting" className="surface-2 rounded-2xl border-2 p-4 mb-6 scroll-mt-20" style={{ borderColor: "var(--accent)" }}>
      <h2 className="text-[17px] font-extrabold mb-1">Waiting for your OK</h2>
      <p className="text-2 text-[13.5px] mb-3">
        {items.length === 1 ? "This message" : `These ${items.length} messages`} to {name} will not go out until you approve. Consent is checked again as it sends.
      </p>
      <div className="space-y-4">
        {items.map((i) => (
          <div key={i.id} className="border rounded-xl p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2 text-[14px]">
              <span className="rounded-full bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 text-[12px] font-bold uppercase">{i.kind}</span>
              {i.subject && <b>{i.subject}</b>}
            </div>
            {i.status === "blocked" && (
              <p className="rounded-xl bg-[#fde8e8] dark:bg-[#3a1c1c] text-[#a12a2a] dark:text-[#f3a3a3] px-3 py-2 text-[14px] mb-2">
                Stopped at the consent check: {i.blockReason ?? "consent changed since it was drafted."}
              </p>
            )}
            {i.reviewNote && i.status === "pending" && (
              <p className="rounded-xl bg-[#fff3d1] dark:bg-[#3a3016] text-[#9a6a00] dark:text-[#f0c14b] px-3 py-2 text-[14px] mb-2">Check: {i.reviewNote}</p>
            )}
            {i.campaignId ? (
              <Link href={`/campaigns/${i.campaignId}/review`} className="inline-flex rounded-xl bg-[var(--accent)] text-white font-bold px-4 min-h-10 items-center">
                Review and send with its batch
              </Link>
            ) : (
              <>
                {i.kind === "email" ? (
                  <div className="bg-[var(--surface)] rounded-xl p-2 mb-2">
                    <EmailFrame itemId={i.id} title={`Email to ${name}`} />
                  </div>
                ) : (
                  <p className="bg-[var(--surface)] rounded-xl px-3 py-2.5 mb-2 whitespace-pre-wrap text-[14px]">{i.body}</p>
                )}
                {i.status === "pending" && <ApprovalActions id={i.id} subject={i.subject} body={i.body.replaceAll("**", "")} />}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
