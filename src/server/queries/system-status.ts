import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { query } from "@/db";

/**
 * Settings → Backups & system (owner-approved preview, 2026-11-28): read-only facts the
 * owner can check without a terminal. Each part fails soft: an unreadable part shows
 * "unknown", never breaks the page.
 */
const BUCKET = process.env.BACKUP_BUCKET ?? "ozirealty-backups-310792823958";
/** The last time a backup was restored end to end and checked (done by hand). */
export const LAST_RESTORE_TEST = "2026-11-27";

let s3: S3Client | null = null;
const client = () => (s3 ??= new S3Client({ region: process.env.AWS_REGION ?? "ap-southeast-2" }));

async function latestDump(): Promise<{ at: Date; size: number } | null> {
  const now = new Date();
  for (let back = 0; back < 3; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const prefix = `pg/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/`;
    const r = await client().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
    const items = (r.Contents ?? []).filter((o) => o.LastModified);
    if (items.length) {
      const last = items.sort((a, b) => b.LastModified!.getTime() - a.LastModified!.getTime())[0];
      return { at: last.LastModified!, size: last.Size ?? 0 };
    }
  }
  return null;
}

async function mediaMirror(): Promise<{ files: number; at: Date | null }> {
  const r = await client().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "media-mirror/", MaxKeys: 1000 }));
  const items = r.Contents ?? [];
  const at = items.reduce<Date | null>((a, o) => (o.LastModified && (!a || o.LastModified > a) ? o.LastModified : a), null);
  return { files: r.KeyCount ?? items.length, at };
}

export async function systemStatus() {
  const [dump, media, sc] = await Promise.all([
    latestDump().catch(() => undefined),
    mediaMirror().catch(() => undefined),
    query((tx) => tx.execute<{ last: string | null }>(sql`select max(day)::text as last from seo_search_daily`)).then((r) => r[0]?.last ?? null).catch(() => null),
  ]);
  return { dump, media, searchConsoleLast: sc, restoreTested: LAST_RESTORE_TEST };
}
