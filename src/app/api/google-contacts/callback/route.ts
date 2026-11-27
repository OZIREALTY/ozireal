import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { exchangeCode } from "@/server/gcontacts/google";
import { putSecret } from "@/server/secrets";

/**
 * Google sends the owner back here after Connect. The state cookie proves the round
 * trip started in this browser; the long-lived sign-in is stored encrypted.
 */
export async function GET(req: NextRequest) {
  const base = process.env.AUTH_URL ?? "https://crm.ozirealty.com.au";
  const back = (q: string) => NextResponse.redirect(new URL(`/contacts/gmail-check?${q}`, base));
  const s = await auth();
  const tenantId = s?.user?.tenantId;
  const userId = s?.user?.id;
  if (!tenantId || !userId) return NextResponse.redirect(new URL("/login", base));
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  if (req.nextUrl.searchParams.get("error")) return back("google=cancelled");
  if (!state || state !== req.cookies.get("gc_state")?.value || !code) return back("google=failed");
  try {
    const { refreshToken } = await exchangeCode(code);
    if (!refreshToken) return back("google=failed");
    await putSecret(tenantId, "GOOGLE_CONTACTS_REFRESH_TOKEN", refreshToken, userId);
    const res = back("google=connected");
    res.cookies.delete({ name: "gc_state", path: "/api/google-contacts" });
    return res;
  } catch {
    return back("google=failed");
  }
}
