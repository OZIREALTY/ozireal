import { redirect } from "next/navigation";

/** The compliance advisor's library now lives in Settings → AI training, legal library (2026-11-19). */
export default function CompliancePage() {
  redirect("/settings/knowledge?shelf=legal");
}
