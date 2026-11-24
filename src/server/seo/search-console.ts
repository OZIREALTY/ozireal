import { ExternalAccountClient, type BaseExternalAccountClient } from "google-auth-library";
import { sql } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { seoSearchDaily, tenants } from "@/db/schema";

/**
 * Google Search Console, read only (owner, 2026-11-24). No key file: the server's AWS
 * role (ozirealty-instance, account 310792823958) is trusted by Google through
 * workload identity federation and acts as the restricted user
 * ozirealty-seo@ozirealty-seo-8153. Free; revoke it in Search Console > Users.
 *
 * None of this is secret (it names who may sign in, not a credential), so it lives
 * here rather than in the env file. GSC_SITE overrides the property if it ever moves.
 */
const SA = "ozirealty-seo@ozirealty-seo-8153.iam.gserviceaccount.com";
const AUDIENCE =
  "//iam.googleapis.com/projects/22410673278/locations/global/workloadIdentityPools/aws-ozirealty/providers/aws-310";
export const GSC_SITE = process.env.GSC_SITE ?? "https://www.ozirealty.com.au/";

let client: BaseExternalAccountClient | null = null;
function google() {
  if (client) return client;
  const c = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: AUDIENCE,
    subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA}:generateAccessToken`,
    token_url: "https://sts.googleapis.com/v1/token",
    credential_source: {
      environment_id: "aws1",
      region_url: "http://169.254.169.254/latest/meta-data/placement/availability-zone",
      url: "http://169.254.169.254/latest/meta-data/iam/security-credentials",
      regional_cred_verification_url: "https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15",
      imdsv2_session_token_url: "http://169.254.169.254/latest/api/token",
    },
  });
  if (!c) throw new Error("Search Console sign-in is not configured.");
  c.scopes = ["https://www.googleapis.com/auth/webmasters.readonly"];
  client = c;
  return c;
}

type Row = { keys: [string, string, string]; clicks: number; impressions: number; position: number };

/** One day of (date, query, page) rows, paged by Google 25k at a time. */
async function fetchDay(day: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let start = 0; ; start += 25000) {
    const r = await google().request<{ rows?: Row[] }>({
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`,
      method: "POST",
      data: { startDate: day, endDate: day, dimensions: ["date", "query", "page"], rowLimit: 25000, startRow: start, dataState: "final" },
    });
    const rows = r.data.rows ?? [];
    out.push(...rows);
    if (rows.length < 25000) return out;
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Daily: fill any missing days in the last 16 months (Google keeps 16), and always
 * re-fetch the last 4, since Google finalises figures for a few days. The first run
 * backfills everything; later runs fetch only a handful of days.
 */
export async function syncSearchConsole(): Promise<{ days: number; rows: number }> {
  const ts = await db.select({ id: tenants.id }).from(tenants);
  const tenantId = ts[0]?.id;
  if (!tenantId) return { days: 0, rows: 0 };

  const have = await withTenant(tenantId, (tx) =>
    tx.execute<{ day: string }>(sql`select distinct day::text as day from seo_search_daily`),
  );
  const done = new Set(have.map((r) => r.day));
  const days: string[] = [];
  const today = new Date();
  for (let i = 2; i <= 486; i++) {
    const d = iso(new Date(today.getTime() - i * 86_400_000));
    if (i <= 5 || !done.has(d)) days.push(d);
  }

  let rows = 0;
  for (const day of days) {
    const data = await fetchDay(day);
    await withTenant(tenantId, async (tx) => {
      await tx.execute(sql`delete from seo_search_daily where day = ${day}`);
      for (let i = 0; i < data.length; i += 1000) {
        await tx.insert(seoSearchDaily).values(
          data.slice(i, i + 1000).map((r) => ({
            tenantId,
            day,
            query: r.keys[1].slice(0, 500),
            page: r.keys[2].slice(0, 1000),
            clicks: Math.round(r.clicks),
            impressions: Math.round(r.impressions),
            position: r.position,
          })),
        ).onConflictDoNothing();
      }
    });
    rows += data.length;
  }
  return { days: days.length, rows };
}
