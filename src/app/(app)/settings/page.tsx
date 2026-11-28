import Link from "next/link";
import { BookOpen, ChevronRight, Lock } from "lucide-react";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { getAgency, getSettings } from "@/server/queries";
import { QueueHealthCard } from "@/components/jobs/queue-health";
import { CredentialsCard } from "@/components/settings/credentials";
import { getSecret, getSecretStatus, secretsConfigured } from "@/server/secrets";
import { LlmSettingsForm } from "@/components/settings/llm-settings";
import { readLlmSettings } from "@/server/queries/llm";
import { getLlmConfig, getBudgetState } from "@/server/ai/config";
import { currentTenantId, db } from "@/db";
import { auth, availableProviders } from "@/auth";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PasswordCard } from "@/components/settings/password-card";
import { AgencyRows, NameRow } from "@/components/settings/edit-rows";
import { systemStatus } from "@/server/queries/system-status";

export const dynamic = "force-dynamic";

/**
 * Settings (owner-approved redesign, 2026-11-28): a menu of six topics, one shown at a
 * time, plain words and a status on each item. Every control the old page had is still
 * here; only the arrangement and the wording changed.
 */
const TABS = [
  { k: "account", label: "My account", icon: "👤" },
  { k: "agency", label: "Agency", icon: "🏢" },
  { k: "ai", label: "AI", icon: "✦" },
  { k: "connections", label: "Connections", icon: "🔌" },
  { k: "compliance", label: "Consent & compliance", icon: "⚖️" },
  { k: "system", label: "Backups & system", icon: "🛡" },
] as const;
type Tab = (typeof TABS)[number]["k"];

const when = (d: Date | string) =>
  new Date(d).toLocaleString("en-AU", { timeZone: "Australia/Adelaide", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Ok({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[#E8F5E9] text-[#1B5E20] dark:bg-[#183A1C] dark:text-[#9BE3A2] px-2.5 py-0.5 text-[12px] font-bold">{children}</span>;
}
function Warn({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[#FFF1DC] text-[#8A4B00] dark:bg-[#3A2C12] dark:text-[#FFC266] px-2.5 py-0.5 text-[12px] font-bold">{children}</span>;
}
function Row({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 border-t text-[14px]">
      <span className="w-[140px] sm:w-[190px] shrink-0 text-2">{label}</span>
      <span className="flex-1 min-w-0 flex flex-wrap items-center gap-2">{children}</span>
      {action}
    </div>
  );
}
function Panel({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="surface-2 border rounded-2xl p-4 sm:p-5">
      <h2 className="text-[17px] font-bold">{title}</h2>
      <p className="text-2 text-[13.5px] mt-0.5 mb-3">{desc}</p>
      {children}
    </section>
  );
}
const linkBtn = "rounded-[10px] border surface-2 px-3 min-h-8 inline-flex items-center text-[13px] font-bold hover:surface-3";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab: Tab = (TABS.find((t) => t.k === raw)?.k ?? "account") as Tab;
  const [agency, settings, tenantId] = await Promise.all([getAgency(), getSettings(), currentTenantId()]);
  const session = await auth();
  const me = session?.user?.id
    ? await db
        .select({ email: users.email, name: users.name, setAt: users.passwordSetAt })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)
        .then((r) => (r[0] ? { email: r[0].email, name: r[0].name, setAt: r[0].setAt?.toISOString() ?? null } : null))
    : null;
  const budget = await getBudgetState(tenantId);
  const spent = `A$${budget.spentAud.toFixed(2)}`;

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, your agency, the AI, and the services the CRM connects to." />

      <div className="grid lg:grid-cols-[230px_1fr] gap-5 items-start">
        <nav className="surface-2 border rounded-2xl p-1.5 lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto" aria-label="Settings sections">
          {TABS.map((t) => (
            <Link
              key={t.k}
              href={`/settings?tab=${t.k}`}
              aria-current={tab === t.k ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 min-h-10 text-[14.5px] whitespace-nowrap ${tab === t.k ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold" : "text-2 hover:surface-3"}`}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-4 min-w-0">
          {tab === "account" && (
            <>
              <Panel title="👤 My account" desc="Who you are in the CRM.">
                <NameRow name={me?.name ?? agency.user.name} role={agency.user.role} licence={agency.licence} />
              </Panel>
              {me && (
                <Panel title="🔑 Sign-in & password" desc="How you sign in to the CRM.">
                  <PasswordCard email={me.email} setAt={me.setAt} google={availableProviders.google} entra={availableProviders.entra} />
                </Panel>
              )}
            </>
          )}

          {tab === "agency" && (
            <Panel title="🏢 Agency" desc="Your business details, used on emails, proposals and the website.">
              <AgencyRows v={{ name: agency.name, tradingName: agency.tradingName, licence: agency.licence, abn: agency.abn, jurisdiction: agency.jurisdiction, timezone: agency.timezone }} />
              <p className="text-3 text-[12.5px] mt-3">One office, one user for now. Adding team members later will be a new feature, not a rebuild.</p>
            </Panel>
          )}

          {tab === "ai" && <AiTab tenantId={tenantId} spent={spent} budget={budget} />}

          {tab === "connections" && <ConnectionsTab tenantId={tenantId} />}

          {tab === "compliance" && (
            <>
              <Panel title="⚖️ Consent wording" desc="What people agree to on each form. It is stored word for word with every consent, so changing it never rewrites what someone already agreed to.">
                {settings.templates.length ? (
                  <div>
                    {settings.templates.map((t) => (
                      <div key={t.form} className="py-2.5 border-t">
                        <b className="text-[14px]">{t.form}</b>
                        <p className="text-2 text-[13px] mt-1 italic">“{t.wording}”</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>No consent wording set up yet.</Empty>
                )}
              </Panel>
              <Panel title="📜 Disclosure rules" desc="Your state’s rules for what must be disclosed. South Australia for now; other states can be added later.">
                {settings.rules.length ? (
                  settings.rules.map((d) => (
                    <div key={d.name} className="py-2.5 border-t">
                      <div className="flex items-center gap-2">
                        <b className="text-[14px]">{d.name}</b>
                        <Badge tone="stock">{d.state}</Badge>
                      </div>
                      <p className="text-2 text-[13px] mt-0.5">{d.detail}</p>
                    </div>
                  ))
                ) : (
                  <Empty>No disclosure rules loaded yet.</Empty>
                )}
              </Panel>
              <Panel title="🔒 Always on" desc="Safety rules that cannot be switched off, on purpose.">
                {[
                  ["Nothing is sent without your OK", "Every email and SMS waits for you to approve it."],
                  ["Consent is checked at the moment of sending", "Someone who unsubscribes after a draft is written never gets it."],
                  ["The AI never changes a contact on its own", "Its suggestions wait for you to confirm them."],
                  ["Website changes need your approval", "SEO suggestions are proposals until you apply them."],
                ].map(([t, d]) => (
                  <div key={t} className="flex gap-2.5 py-2.5 border-t">
                    <Lock size={14} className="text-3 mt-0.5 shrink-0" />
                    <div>
                      <b className="block text-[14px]">{t}</b>
                      <span className="text-2 text-[13px]">{d}</span>
                    </div>
                  </div>
                ))}
              </Panel>
            </>
          )}

          {tab === "system" && <SystemTab />}
        </div>
      </div>
    </>
  );
}

async function AiTab({ tenantId, spent, budget }: { tenantId: string; spent: string; budget: Awaited<ReturnType<typeof getBudgetState>> }) {
  const [llmRow, llmDefaults] = await Promise.all([readLlmSettings(tenantId), getLlmConfig(tenantId)]);
  const llmValues = {
    fastModel: llmRow?.fastModel ?? llmDefaults.fastModel,
    writingModel: llmRow?.writingModel ?? llmDefaults.writingModel,
    proseTemperature: llmRow?.proseTemperature ?? llmDefaults.proseTemperature,
    extractionMaxTokens: llmRow?.extractionMaxTokens ?? llmDefaults.extractionMaxTokens,
    briefMaxTokens: llmRow?.briefMaxTokens ?? llmDefaults.briefMaxTokens,
    rankingMaxTokens: llmRow?.rankingMaxTokens ?? llmDefaults.rankingMaxTokens,
    monthlyBudgetAud: llmRow?.monthlyBudgetAud ?? null,
    budgetAction: llmRow?.budgetAction ?? llmDefaults.budgetAction,
    fastInputUsdPerMtok: llmRow?.fastInputUsdPerMtok ?? String(llmDefaults.pricing.fast.input),
    fastOutputUsdPerMtok: llmRow?.fastOutputUsdPerMtok ?? String(llmDefaults.pricing.fast.output),
    writingInputUsdPerMtok: llmRow?.writingInputUsdPerMtok ?? String(llmDefaults.pricing.writing.input),
    writingOutputUsdPerMtok: llmRow?.writingOutputUsdPerMtok ?? String(llmDefaults.pricing.writing.output),
    audPerUsd: llmRow?.audPerUsd ?? String(llmDefaults.audPerUsd),
  };
  const tile = "flex items-center gap-3 border rounded-xl p-3 hover:border-[var(--accent)]";
  return (
    <>
      <Panel title="✦ AI" desc="What the AI knows about you, what it costs, and which models it uses.">
        <div className="grid sm:grid-cols-2 gap-2.5">
          <Link href="/settings/knowledge" className={tile}>
            <BookOpen size={20} className="text-[var(--accent)] shrink-0" />
            <span className="flex-1 min-w-0"><b className="block text-[14px]">AI training</b><span className="text-2 text-[12.5px]">Your instructions, agency facts and the law</span></span>
            <ChevronRight size={16} className="text-3" />
          </Link>
          <Link href="/costs" className={tile}>
            <span className="text-[20px]">💰</span>
            <span className="flex-1 min-w-0">
              <b className="block text-[14px]">Spend this month</b>
              <span className="text-2 text-[12.5px]">{spent}{budget.budgetAud ? ` of A$${budget.budgetAud} limit` : " · no limit set"}</span>
            </span>
            {budget.overBudget ? <Warn>Over</Warn> : <ChevronRight size={16} className="text-3" />}
          </Link>
        </div>
      </Panel>
      <Panel title="⚙️ Models & spending limit" desc="Which AI models write and read for you, and the monthly cap.">
        <LlmSettingsForm values={llmValues} budget={budget} />
      </Panel>
    </>
  );
}

async function ConnectionsTab({ tenantId }: { tenantId: string }) {
  const statuses = (await getSecretStatus(tenantId)).filter((x) => x.name !== "GOOGLE_CONTACTS_REFRESH_TOKEN");
  const [contacts, st] = await Promise.all([getSecret(tenantId, "GOOGLE_CONTACTS_REFRESH_TOKEN").catch(() => null), systemStatus()]);
  return (
    <>
      <Panel title="🔌 Connected services" desc="Services the CRM uses that sign in by themselves.">
        <Row label="Google Contacts" action={<Link href="/contacts/gmail-check" className={linkBtn}>Open check</Link>}>
          {contacts ? <Ok>✓ Connected</Ok> : <Warn>Not connected</Warn>}
          <span className="text-2 text-[13px]">checked every second Monday</span>
        </Row>
        <Row label="Google Search Console" action={<Link href="/seo" className={linkBtn}>Open SEO</Link>}>
          {st.searchConsoleLast ? <Ok>✓ Connected</Ok> : <Warn>No data yet</Warn>}
          {st.searchConsoleLast && <span className="text-2 text-[13px]">data to {day(st.searchConsoleLast)}</span>}
        </Row>
        <Row label="Pixabay (free photos)">{process.env.PIXABAY_API_KEY ? <Ok>✓ Connected</Ok> : <Warn>Not set up</Warn>}</Row>
      </Panel>
      <Panel title="🔑 Keys and passwords" desc="Stored encrypted. Only the last 4 characters are ever shown, so you can tell which key is which.">
        <CredentialsCard statuses={statuses} encryptionReady={secretsConfigured()} />
      </Panel>
    </>
  );
}

async function SystemTab() {
  const st = await systemStatus();
  const dumpFresh = st.dump && Date.now() - st.dump.at.getTime() < 36 * 3600e3;
  return (
    <>
      <Panel title="🛡 Backups" desc="Is your data safe. Copies are kept in Amazon (Sydney); deleted or overwritten copies stay recoverable for 30 days.">
        <Row label="Database backup">
          {st.dump === undefined ? <Warn>Status unknown</Warn> : st.dump ? (dumpFresh ? <Ok>✓ {when(st.dump.at)}</Ok> : <Warn>Last {when(st.dump.at)}: older than a day</Warn>) : <Warn>None found</Warn>}
          <span className="text-2 text-[13px]">every night · restore last tested {day(st.restoreTested)}</span>
        </Row>
        <Row label="Photos & files backup">
          {st.media === undefined ? <Warn>Status unknown</Warn> : <Ok>✓ {st.media.files} files</Ok>}
          {st.media?.at && <span className="text-2 text-[13px]">latest copy {when(st.media.at)}</span>}
        </Row>
      </Panel>
      <Panel title="⚙️ Background work" desc="Jobs the CRM runs by itself: reading emails, matching, backups and syncs.">
        <QueueHealthCard />
      </Panel>
      <Panel title="🧾 Records" desc="Every change and who made it.">
        <Row label="Audit log" action={<Link href="/audit" className={linkBtn}>Open</Link>}>
          <span className="text-2 text-[13px]">kept permanently</span>
        </Row>
      </Panel>
    </>
  );
}

