import { getSecret } from "@/server/secrets";

/**
 * Google Contacts, read-only (People API; owner-approved 2026-11-27). The OAuth
 * client lives in the Search Console project (audience Internal); its id and secret
 * are in /etc/ozirealty/env, and the long-lived sign-in from Connect is a tenant
 * secret, encrypted at rest. Plain fetch, no Google SDK.
 */
export const SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

function client() {
  const id = process.env.GOOGLE_CONTACTS_CLIENT_ID;
  const secret = process.env.GOOGLE_CONTACTS_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google Contacts is not set up on the server.");
  return { id, secret };
}

export function redirectUri() {
  const base = process.env.AUTH_URL ?? "https://crm.ozirealty.com.au";
  return `${base.replace(/\/$/, "")}/api/google-contacts/callback`;
}

export function authUrl(state: string) {
  const qs = new URLSearchParams({
    client_id: client().id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH}?${qs}`;
}

export async function exchangeCode(code: string): Promise<{ refreshToken: string | null; accessToken: string }> {
  const { id, secret } = client();
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error_description ?? "Google did not accept the sign-in.");
  return { refreshToken: j.refresh_token ?? null, accessToken: j.access_token };
}

async function accessToken(tenantId: string) {
  const refresh = await getSecret(tenantId, "GOOGLE_CONTACTS_REFRESH_TOKEN");
  if (!refresh) throw new Error("Google Contacts is not connected yet.");
  const { id, secret } = client();
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
  });
  const j = (await r.json()) as { access_token?: string; error?: string };
  if (!r.ok || !j.access_token) {
    throw new Error(j.error === "invalid_grant" ? "Google disconnected the CRM. Press Connect again." : "Google did not answer. Try again later.");
  }
  return j.access_token;
}

export type GoogleContact = { resourceName: string; etag: string; name: string; emails: string[]; phones: string[] };

/** Every saved contact, all pages. Names, emails and phones only. */
export async function listContacts(tenantId: string): Promise<GoogleContact[]> {
  const token = await accessToken(tenantId);
  const out: GoogleContact[] = [];
  let page: string | undefined;
  for (let i = 0; i < 50; i++) {
    const qs = new URLSearchParams({ personFields: "names,emailAddresses,phoneNumbers", pageSize: "1000", sortOrder: "LAST_MODIFIED_DESCENDING" });
    if (page) qs.set("pageToken", page);
    const r = await fetch(`https://people.googleapis.com/v1/people/me/connections?${qs}`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Google Contacts answered ${r.status}.`);
    const j = (await r.json()) as {
      connections?: {
        resourceName: string;
        etag: string;
        names?: { displayName?: string }[];
        emailAddresses?: { value?: string }[];
        phoneNumbers?: { value?: string; canonicalForm?: string }[];
      }[];
      nextPageToken?: string;
    };
    for (const c of j.connections ?? []) {
      const emails = (c.emailAddresses ?? []).map((e) => e.value?.trim()).filter((x): x is string => !!x);
      const phones = (c.phoneNumbers ?? []).map((p) => (p.canonicalForm ?? p.value ?? "").trim()).filter(Boolean);
      const name = c.names?.[0]?.displayName?.trim() || emails[0] || phones[0] || "";
      if (!name || (!emails.length && !phones.length)) continue;
      out.push({ resourceName: c.resourceName, etag: c.etag, name, emails, phones });
    }
    page = j.nextPageToken;
    if (!page) break;
  }
  return out;
}
