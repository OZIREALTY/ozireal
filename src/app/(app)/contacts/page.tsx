import Link from "next/link";
import { Download, Ban, Phone } from "lucide-react";
import {
  PageHeader,
  Badge,
  Table,
  THead,
  TH,
  TD,
  TR,
  Card,
  CardTitle,
  Empty,
  ProtoNote,
} from "@/components/ui";
import { getContacts, getSavedViews, getContactsBySource } from "@/server/queries";
import { HBars } from "@/components/charts";
import { relative, money } from "@/lib/utils";
import { NewContactButton } from "@/components/forms/contact-forms";
import { BulkSelection, SelectAllBox, RowBox } from "@/components/contacts/bulk-select";
import { ImportContactsButton } from "@/components/contacts/contact-import";
import { roleLabel, CONTACT_ROLES } from "@/lib/roles";

const roleTone = {
  buyer: "brand",
  vendor: "stock",
  landlord: "stock",
  tenant: "neutral",
  referrer: "neutral",
  investor: "ai",
  developer: "ai",
  business_vendor: "stock",
  agent: "brand",
} as const;


export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; role?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const order = sp.sort === "oldest" ? "oldest" : "newest";
  /** Role filter (2026-11-12): one role, or "none" for people still to sort. */
  const roleFilter =
    sp.role === "none" || (CONTACT_ROLES as readonly string[]).includes(sp.role ?? "") ? (sp.role as string) : null;
  const [everyone, savedViews, contactsBySource] = await Promise.all([
    getContacts({ order }),
    getSavedViews(),
    getContactsBySource(),
  ]);
  /** Search (2026-11-21): name, email, phone, suburb or tag, all words must match. */
  const q = (sp.q ?? "").trim().slice(0, 80);
  const words = q.toLowerCase().split(/s+/).filter(Boolean);
  const digits = q.replace(/D/g, "");
  const byRole = !roleFilter
    ? everyone
    : everyone.filter((c) => (roleFilter === "none" ? c.roles.length === 0 : (c.roles as string[]).includes(roleFilter)));
  const contacts = !words.length
    ? byRole
    : byRole.filter((c) => {
        const hay = [c.firstName, c.lastName, c.email, c.suburb, ...c.tags].filter(Boolean).join(" ").toLowerCase();
        const phone = [c.phone, c.secondaryPhone].filter(Boolean).join(" ").replace(/D/g, "");
        return words.every((w) => hay.includes(w)) || (digits.length >= 4 && phone.includes(digits.replace(/^0/, "")));
      });
  const roleCount = (r: string) =>
    everyone.filter((c) => (r === "none" ? c.roles.length === 0 : (c.roles as string[]).includes(r))).length;
  const href = (o: { sort?: string; role?: string | null }) => {
    const qp = new URLSearchParams();
    const so = o.sort ?? order;
    const ro = o.role === undefined ? roleFilter : o.role;
    if (so === "oldest") qp.set("sort", "oldest");
    if (ro) qp.set("role", ro);
    if (sp.q) qp.set("q", sp.q);
    const qs = qp.toString();
    return qs ? `/contacts?${qs}` : "/contacts";
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={`${everyone.length} people. One record per person, accumulating roles over time — never one record per deal.`}
        actions={
          <>
            {/* The "Saved views" button here opened nothing and duplicated the card
                below. Replaced with the export, which is real — and which carries the
                consent state alongside every name, so a list pulled into a spreadsheet
                cannot be worked from without it. */}
            <a
              href="/api/export/contacts"
              className="inline-flex items-center gap-1.5 rounded-md surface-2 border text-[13px] font-medium px-3 min-h-9 hover:surface-3"
            >
              <Download size={13} />
              Export CSV
            </a>
            <ImportContactsButton />
            <NewContactButton />
          </>
        }
      />

      <form action="/contacts" method="get" className="mb-4 flex gap-2" role="search">
        {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
        {order === "oldest" && <input type="hidden" name="sort" value="oldest" />}
        <input
          id="contact-search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, phone, email, suburb or tag"
          aria-label="Search contacts"
          className="flex-1 min-w-0 surface-2 border-[1.5px] rounded-xl px-4 min-h-12 text-[16px]"
        />
        <button type="submit" className="rounded-xl bg-[var(--accent)] text-white font-bold px-5 min-h-12">Search</button>
        {q && (
          <Link href={roleFilter ? `/contacts?role=${roleFilter}` : "/contacts"} className="rounded-xl border font-semibold px-4 min-h-12 inline-flex items-center">
            Clear
          </Link>
        )}
      </form>
      {q && (
        <p className="mb-3 text-[14px] text-2">
          {contacts.length} {contacts.length === 1 ? "match" : "matches"} for <b className="text-[var(--text)]">{q}</b>
        </p>
      )}

      <div className="hidden md:grid lg:grid-cols-[1fr_300px] gap-4 mb-4">
        <div className="space-y-4">
          <Card className="p-3">
            <CardTitle>Saved views</CardTitle>
            <div className="flex flex-wrap gap-2">
              {/* These now carry a real filter, so they lead somewhere: the audience
                  builder, which is the screen that can actually apply one. Filtering
                  this table in place is still to come. */}
              {savedViews.map((v) => (
                <Link
                  key={v.id}
                  href={`/campaigns/new?segment=${v.id}`}
                  title={v.detail ?? undefined}
                  className="text-[12px] border rounded-md px-2.5 py-1.5 surface-3 text-2 hover:border-[var(--line-strong)] transition-colors"
                >
                  <span className="font-medium">{v.name}</span>
                </Link>
              ))}
              {savedViews.length === 0 && (
                <span className="text-3 text-[12px]">No saved views yet.</span>
              )}
            </div>
            <ProtoNote>
              A saved view is a stored filter, not a copy of the data — it finds whoever
              matches on the day it is used. Opening one shows who that is now, with the
              people it cannot reach counted separately.
            </ProtoNote>
          </Card>

        </div>

        <Card>
          <CardTitle>Where they came from</CardTitle>
          <p className="text-3 text-[11.5px] -mt-1 mb-2">All time, by channel.</p>
          {contactsBySource.length === 0 ? (
            <Empty>No data yet.</Empty>
          ) : (
            <HBars
              data={contactsBySource}
              labelKey="source"
              valueKey="count"
              height={190}
            />
          )}
        </Card>
      </div>

      <div className="mb-2 flex items-center gap-2 text-[12.5px]">
        <span className="text-2">Sort by date added:</span>
        {(["newest", "oldest"] as const).map((o) => (
          <Link
            key={o}
            href={href({ sort: o })}
            aria-current={order === o ? "true" : undefined}
            className={
              order === o
                ? "rounded-md px-2.5 py-1 bg-[var(--accent)] text-white"
                : "rounded-md px-2.5 py-1 border surface-2 hover:surface-3"
            }
          >
            {o === "newest" ? "Newest first" : "Oldest first"}
          </Link>
        ))}
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 text-[12.5px]" aria-label="Filter by role">
        {[
          { key: null, label: `All ${everyone.length}` },
          ...CONTACT_ROLES.map((r) => ({ key: r as string, label: `${roleLabel(r)} ${roleCount(r)}` })),
          { key: "none", label: `No role ${roleCount("none")}` },
        ]
          .filter((f) => f.key === null || f.key === "none" || roleCount(f.key) > 0)
          .map((f) => (
            <Link
              key={f.key ?? "all"}
              href={href({ role: f.key })}
              aria-current={roleFilter === f.key ? "true" : undefined}
              className={
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1 " +
                (roleFilter === f.key
                  ? "bg-[var(--accent)] text-white"
                  : f.key === "none"
                    ? "border border-[#F3D9A8] bg-[#FFF7E0] text-[#8A4B00] hover:border-[#D98A00]"
                    : "border surface-2 hover:surface-3")
              }
            >
              {f.label}
            </Link>
          ))}
      </div>

      <BulkSelection
        allIds={contacts.map((c) => c.id)}
        names={Object.fromEntries(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]))}
      >
      <div className="md:hidden space-y-2">
        {contacts.map((c) => (
          <div key={c.id} className="surface-2 border rounded-2xl p-3 flex items-center gap-3">
            <span className="h-11 w-11 shrink-0 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] grid place-items-center font-extrabold">
              {(c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "") || "?"}
            </span>
            <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
              <b className="block truncate text-[16px]">{c.firstName} {c.lastName}</b>
              <small className="block truncate text-2 text-[13.5px]">
                {[c.roles.map(roleLabel).join(", ") || c.tags[0], c.suburb, c.priceMax ? `up to ${Math.round(c.priceMax / 1000)}k` : null].filter(Boolean).join(" · ") || c.email || "—"}
              </small>
            </Link>
            {c.phone && (
              <a href={`tel:${c.phone.replace(/s+/g, "")}`} aria-label={`Call ${c.firstName}`} className="h-11 w-11 shrink-0 rounded-full bg-[#e3f4ea] text-[#1f7a4d] dark:bg-[#173527] dark:text-[#5fd39a] grid place-items-center">
                <Phone size={19} />
              </a>
            )}
          </div>
        ))}
        {!contacts.length && <p className="text-2 py-6 text-center">Nobody matches.</p>}
      </div>
      <div className="hidden md:block">
      <Table minWidth={940}>
        <THead>
          <TR>
            <TH className="w-10">
              <SelectAllBox />
            </TH>
            <TH>Name</TH>
            <TH>Roles</TH>
            <TH>Intent</TH>
            <TH>Budget</TH>
            <TH>Last outcome</TH>
            <TH>Last touch</TH>
            <TH>Consent</TH>
          </TR>
        </THead>
        <tbody>
          {contacts.map((c) => {
            const emailConsent = c.consents.find((x) => x.channel === "email");
            const smsConsent = c.consents.find((x) => x.channel === "sms");
            const identity = [c.suburb, c.phone].filter(Boolean).join(" · ");
            return (
              <TR key={c.id}>
                <TD>
                  <RowBox id={c.id} name={`${c.firstName} ${c.lastName}`} />
                </TD>
                <TD nowrap>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="font-medium hover:underline underline-offset-2"
                  >
                    {c.firstName} {c.lastName}
                  </Link>
                  {c.fromNewHomes && (
                    <span
                      className="ml-1.5 align-middle rounded px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide bg-[#FFF1EB] text-[#B23A0E] border border-[#F5C7B3]"
                      title="Enquired from a New Homes project"
                    >
                      New Homes
                    </span>
                  )}
                  <div className="text-3 text-[12px]">{identity || "—"}</div>
                  {c.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.tags.slice(0, 4).map((t) => (
                        <span key={t} className="rounded px-1.5 py-px text-[11px] surface-1 border text-2">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {c.roles.map((r) => (
                      <Badge key={r} tone={roleTone[r]}>
                        {roleLabel(r)}
                      </Badge>
                    ))}
                    {/* No role on record: the contact's tags stand in (owner's request, 2026-11-04). */}
                    {c.roles.length === 0 &&
                      c.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
                  </div>
                </TD>
                <TD>
                  {c.intentType ? (
                    <>
                      <div className="capitalize text-[12.5px]">{c.intentType}</div>
                      <div className="text-3 text-[11.5px] capitalize">
                        {[
                          c.sentiment,
                          c.confidence !== null ? c.confidence.toFixed(2) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </>
                  ) : (
                    <span className="text-3">—</span>
                  )}
                </TD>
                <TD className="tabular whitespace-nowrap">
                  {c.priceMax && c.priceMax > 0 ? (
                    <span className="text-2 text-[12.5px]">
                      {money(c.priceMin ?? 0)}–{money(c.priceMax)}
                    </span>
                  ) : (
                    <span className="text-3">—</span>
                  )}
                </TD>
                <TD className="max-w-[260px] text-2">
                  {c.lastFollowupOutcome ?? "—"}
                </TD>
                <TD className="whitespace-nowrap text-2">
                  {c.lastFollowupAt ? relative(c.lastFollowupAt) : "—"}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {c.doNotContact && (
                      <Badge tone="blocked">
                        <Ban size={10} />
                        DNC
                      </Badge>
                    )}
                    {emailConsent && (
                      <Badge
                        tone={emailConsent.status === "granted" ? "sent" : "blocked"}
                      >
                        email
                      </Badge>
                    )}
                    {smsConsent && smsConsent.status === "granted" && (
                      <Badge tone="sent">sms</Badge>
                    )}
                  </div>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      </div>
      </BulkSelection>

      {contacts.length === 0 && <Empty>No contacts yet.</Empty>}

      <ProtoNote>
        These rows come from Postgres through the tenant-scoped client, and{" "}
        <strong>New contact</strong> writes to it. Sorting and filtering are still to
        come. Consent state is a column because it decides what you are allowed to do
        with a row — it is not an afterthought.
      </ProtoNote>
    </>
  );
}
