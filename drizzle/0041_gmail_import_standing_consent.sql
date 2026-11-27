-- Gmail imports get the agency's standing consent like every other channel (owner,
-- 2026-11-27: "solve it over all imports from every channel"). Backfill for contacts
-- already added from the Gmail check. Same rule as grantStandingConsent: never on a
-- channel that already has any record (an opt-out stays in force), never for a
-- do-not-contact or removed contact.
INSERT INTO consents (tenant_id, contact_id, channel, status, source_form, wording_shown, ip_address, occurred_at)
SELECT c.tenant_id, c.id, ch.channel::consent_channel, 'granted',
       'Agency standing consent (owner-confirmed 24 Nov 2026)',
       'Consent obtained by the agency before entry into the CRM — confirmed by the owner, 24 Nov 2026',
       NULL, now()
FROM contacts c
JOIN gmail_contact_items g ON g.crm_contact_id = c.id AND g.status = 'added'
CROSS JOIN (VALUES ('email'), ('sms'), ('phone')) AS ch(channel)
WHERE NOT c.do_not_contact
  AND c.tombstoned_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM consents x WHERE x.contact_id = c.id AND x.channel::text = ch.channel);
