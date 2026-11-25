import { InsightsTabs } from "@/components/shell/insights-tabs";

/** Shown the instant a tab is clicked, so the click visibly responds (owner, 2026-11-25). */
export default function Loading() {
  return (
    <>
      <InsightsTabs />
      <div className="animate-pulse" aria-busy="true" aria-label="Loading">
        <div className="h-8 w-56 rounded-lg surface-2 mb-2" />
        <div className="h-4 w-96 max-w-full rounded surface-2 mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl surface-2" />
          ))}
        </div>
        <div className="h-64 rounded-2xl surface-2" />
      </div>
    </>
  );
}
