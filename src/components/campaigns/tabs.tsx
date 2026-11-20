import Link from "next/link";

/** The two halves of Campaigns: writing emails, and how every email did (2026-11-20). */
export function CampaignTabs({ active }: { active: "write" | "insights" }) {
  const tab = (on: boolean) =>
    `rounded-full border-[1.5px] px-4 min-h-10 inline-flex items-center font-bold text-[14.5px] ${on ? "bg-[var(--accent)]/10" : "surface-2 hover:bg-[var(--surface)]"}`;
  const on = { borderColor: "var(--accent)" };
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <Link href="/campaigns" className={tab(active === "write")} style={active === "write" ? on : undefined}>
        Emails
      </Link>
      <Link href="/campaigns/insights" className={tab(active === "insights")} style={active === "insights" ? on : undefined}>
        Email insights
      </Link>
    </div>
  );
}
