"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The SEO workspace's own tabs (owner-approved preview, 2026-11-25): Google data, then
 * the blog that turns it into content. Opportunities joins between them next.
 */
const TABS = [
  { href: "/seo", label: "Overview" },
  { href: "/seo/blog", label: "Blog" },
] as const;

export function SeoTabs({ counts }: { counts?: Partial<Record<(typeof TABS)[number]["href"], number>> }) {
  const path = usePathname();
  return (
    <nav aria-label="SEO" className="flex gap-1 border-b mb-5 overflow-x-auto">
      {TABS.map((t) => {
        const on = t.href === "/seo" ? path === "/seo" : path === t.href || path.startsWith(t.href + "/");
        const n = counts?.[t.href];
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`px-4 py-2.5 text-[14px] font-semibold border-b-[3px] -mb-px whitespace-nowrap ${
              on ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-2 hover:text-[var(--fg)]"
            }`}
          >
            {t.label}
            {n != null && <span className="ml-1.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 text-[11.5px]">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
