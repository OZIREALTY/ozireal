import { sql } from "drizzle-orm";
import { query } from "@/db";

/**
 * Search Console figures for the SEO page (2026-11-24). "Last 28 days" ends at the
 * newest day synced (Google lags 2-3 days), compared with the 28 days before it.
 * Position is impression-weighted, as Search Console itself reports it.
 */
export type SeoTotals = { clicks: number; impressions: number; ctr: number; position: number };
export type SeoRow = { key: string; clicks: number; impressions: number; ctr: number; position: number; prevClicks: number; prevImpressions: number; prevPosition: number };

export async function getSearchOverview() {
  return query(async (tx) => {
    const [range] = await tx.execute<{ last: string | null; first: string | null }>(
      sql`select max(day)::text as last, min(day)::text as first from seo_search_daily`,
    );
    if (!range?.last) return null;
    const last = range.last;

    const totals = async (from: number, to: number) => {
      const [t] = await tx.execute<{ clicks: number; impressions: number; pos: number | null }>(sql`
        select coalesce(sum(clicks),0)::int as clicks, coalesce(sum(impressions),0)::int as impressions,
               sum(position*impressions)/nullif(sum(impressions),0) as pos
        from seo_search_daily
        where day > ${last}::date - ${from}::int and day <= ${last}::date - ${to}::int`);
      return { clicks: t.clicks, impressions: t.impressions, ctr: t.impressions ? t.clicks / t.impressions : 0, position: Number(t.pos ?? 0) };
    };

    const grouped = async (col: "query" | "page", order: string, limit: number) =>
      (await tx.execute<SeoRow>(sql`
        with cur as (
          select ${sql.raw(col)} as key, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
                 sum(position*impressions)/nullif(sum(impressions),0) as position
          from seo_search_daily where day > ${last}::date - 28 group by 1),
        prev as (
          select ${sql.raw(col)} as key, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
                 sum(position*impressions)/nullif(sum(impressions),0) as position
          from seo_search_daily where day > ${last}::date - 56 and day <= ${last}::date - 28 group by 1)
        select coalesce(cur.key, prev.key) as key,
               coalesce(cur.clicks,0) as clicks, coalesce(cur.impressions,0) as impressions,
               case when coalesce(cur.impressions,0) > 0 then cur.clicks::float / cur.impressions else 0 end as ctr,
               coalesce(cur.position,0)::float as position,
               coalesce(prev.clicks,0) as "prevClicks", coalesce(prev.impressions,0) as "prevImpressions",
               coalesce(prev.position,0)::float as "prevPosition"
        from cur full join prev on prev.key = cur.key
        order by ${sql.raw(order)} limit ${limit}`)).map((r) => ({ ...r, position: Number(r.position), prevPosition: Number(r.prevPosition), ctr: Number(r.ctr) }));

    // Every week synced (up to 16 months); the chart filters the range and the measure.
    const weekly = (await tx.execute<{ start: string; clicks: number; impressions: number; position: number | null }>(sql`
      select to_char(date_trunc('week', day), 'YYYY-MM-DD') as start, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
             (sum(position*impressions)/nullif(sum(impressions),0))::float as position
      from seo_search_daily
      group by date_trunc('week', day) order by date_trunc('week', day)`)).map((w) => ({ ...w, position: w.position == null ? null : Number(w.position) }));

    return {
      last,
      first: range.first!,
      now: await totals(28, 0),
      before: await totals(56, 28),
      weekly: [...weekly],
      topQueries: await grouped("query", "clicks desc, impressions desc", 25),
      topPages: await grouped("page", "clicks desc, impressions desc", 25),
      // Quick wins: seen often, ranking on page 1-2 but not top 4.
      almostThere: (await grouped("query", "impressions desc", 400))
        .filter((r) => r.impressions >= 20 && r.position > 4 && r.position <= 20)
        .slice(0, 20),
      // Pages that lost the most clicks month on month.
      losing: (await grouped("page", `coalesce(cur.clicks,0) - coalesce(prev.clicks,0)`, 15)).filter((r) => r.clicks < r.prevClicks),
    };
  });
}
