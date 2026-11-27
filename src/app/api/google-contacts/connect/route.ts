import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { authUrl } from "@/server/gcontacts/google";

/** Connect Google Contacts (read-only): send the signed-in owner to Google's consent page. */
export async function GET() {
  const s = await auth();
  if (!s?.user?.tenantId) return NextResponse.redirect(new URL("/login", process.env.AUTH_URL ?? "https://crm.ozirealty.com.au"));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("gc_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google-contacts", maxAge: 600 });
  return res;
}
