import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { approvalItems, tenants } from "@/db/schema";
import { getSecret } from "@/server/secrets";
import { ingestThrough } from "@/server/intake/pipeline";

/**
 * Replies to sent emails (option A, owner-approved 2026-11-20). Campaign emails go out
 * from the agency's Google mailbox, so replies arrive there. Every few minutes this reads
 * the INBOX headers of the last three days and picks ONLY messages answering an email
 * the CRM sent (In-Reply-To / References carrying our Message-ID). Everything else in the
 * mailbox is never fetched. A reply goes through the email channel adapter like any other
 * inbound email (§5), so it lands on the contact's interaction log, and the sent email is
 * marked replied.
 */
const GMAIL_USER = process.env.GMAIL_USER ?? "admin@ozirealty.com.au";
const norm = (id: string) => id.trim().replace(/^<|>$/g, "").toLowerCase();

export async function checkReplies() {
  const ts = await db.select({ id: tenants.id }).from(tenants);
  let found = 0;
  for (const t of ts) {
    const pass = await getSecret(t.id, "GMAIL_APP_PASSWORD").catch(() => null);
    if (!pass) continue;
    found += await checkTenant(t.id, pass.replace(/\s+/g, ""));
  }
  return { found };
}

async function checkTenant(tenantId: string, pass: string) {
  const since = new Date(Date.now() - 60 * 864e5);
  const sent = await withTenant(tenantId, (tx) =>
    tx
      .select({ id: approvalItems.id, msgId: approvalItems.providerMessageId })
      .from(approvalItems)
      .where(and(eq(approvalItems.status, "sent"), isNotNull(approvalItems.providerMessageId), isNull(approvalItems.repliedAt), gt(approvalItems.sentAt, since))),
  );
  if (!sent.length) return 0;
  const byMsg = new Map(sent.map((s) => [norm(s.msgId!), s.id]));

  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: GMAIL_USER, pass }, logger: false });
  await client.connect();
  const hits: { uid: number; itemId: string }[] = [];
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const m of client.fetch({ since: new Date(Date.now() - 3 * 864e5) }, { uid: true, envelope: true, headers: ["references"] })) {
        const refs = [m.envelope?.inReplyTo ?? "", ...(m.headers?.toString("utf8").replace(/^references:/i, "").split(/\s+/) ?? [])]
          .filter(Boolean)
          .map(norm);
        const itemId = refs.map((r) => byMsg.get(r)).find(Boolean);
        if (itemId) hits.push({ uid: m.uid, itemId });
      }
      for (const h of hits) {
        const msg = await client.fetchOne(String(h.uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const mime = msg.source.toString("utf8");
        await ingestThrough("email", { mime, rawS3Key: null }, tenantId);
        const snippet = await replySnippet(mime);
        await withTenant(tenantId, (tx) =>
          tx
            .update(approvalItems)
            .set({ repliedAt: new Date(), replySnippet: snippet })
            .where(and(eq(approvalItems.id, h.itemId), isNull(approvalItems.repliedAt))),
        );
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => null);
  }
  return hits.length;
}

/** The new words of a reply: quoted history and signatures cut off. */
async function replySnippet(mime: string) {
  const { simpleParser } = await import("mailparser");
  const mail = await simpleParser(mime);
  const lines: string[] = [];
  for (const l of (mail.text ?? "").split(/\r?\n/)) {
    if (/^\s*>/.test(l) || /^On .+wrote:\s*$/i.test(l.trim()) || /^-{2,}\s*$/.test(l.trim())) break;
    if (l.trim()) lines.push(l.trim());
  }
  return lines.join(" ").slice(0, 280) || null;
}

