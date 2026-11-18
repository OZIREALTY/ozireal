import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { AGENCY } from "@/components/public/agency";

/**
 * Privacy policy, required by APP 1. Written from what the system actually does (what
 * the forms collect, where data is held, which vendors process it, the consent and
 * unsubscribe records). A first draft for the licensee to review; change the wording
 * here, not by linking out to another site's policy.
 */

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${AGENCY.name} collects, uses, stores and protects your personal information under the Privacy Act 1988 and the Australian Privacy Principles.`,
  alternates: { canonical: "/privacy" },
};

const A = AGENCY;

export default function Page() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy"
      titleEm="policy"
      lede={`How ${A.name} collects, uses, stores and protects your personal information, under the Privacy Act 1988 (Cth) and the Australian Privacy Principles.`}
      updated="11 November 2026"
      sections={[
        {
          heading: "Who we are",
          body: [
            `${A.name} (ABN ${A.abn}, ${A.licence}) is a real estate agency at ${A.office}. In this policy "we" and "us" means ${A.name}.`,
            `${A.name}, AussiAcc, Smart Loanz and Aussie Will all operate under Prospect Business Centre Pty Ltd (ABN 38 603 202 875), as one group of businesses. When you give your personal information to any one of them, it is shared across the whole group, as explained in Sharing within our group of businesses below.`,
            `Questions about this policy or your information go to ${A.email} or ${A.phone}.`,
          ],
        },
        {
          heading: "What we collect",
          body: [
            "Your name, email address, phone number and postal or property address when you fill in a form, call, email or message us.",
            "What you tell us about your property needs: the property you own or want, price range, suburbs, timing, finance position and similar details, and the notes we keep of our conversations with you.",
            "A record of any consent you give us to marketing: how and when you gave it, and the wording you agreed to.",
            "Basic technical information when you use this website, such as your IP address and browser type, used to keep the site secure and working.",
            "We do not ask for sensitive information (such as health information) and ask that you do not send it to us.",
          ],
        },
        {
          heading: "How we collect it",
          body: [
            "Mostly directly from you: through forms on this website, by phone, email, SMS or social media message, at inspections, appraisals, meetings and events.",
            "Sometimes from others: from property portals when you enquire about a listing, from the other party, conveyancer or agent in a transaction, from public records, or from one of our associated businesses when you have asked to be referred to us.",
            "If we receive your information from someone other than you, we will tell you we have it and how we got it, unless it is obvious from the circumstances.",
            "Where it is lawful and practical, you can deal with us without giving your name, for example a general question by phone. We need your contact details to respond to an enquiry or act for you.",
          ],
        },
        {
          heading: "Why we collect it",
          body: [
            "To answer your enquiry and provide the service you asked for: appraisals, sales, leasing, property management, buyer advocacy, investment and related services.",
            "To match you with properties, or your property with buyers and tenants, that fit what you have told us.",
            "To send you marketing, but only if you have opted in. Every marketing message identifies us and includes a way to unsubscribe, as the Spam Act 2003 requires.",
            "To meet our legal obligations as a licensed agent in South Australia.",
          ],
        },
        {
          heading: "How we use AI",
          body: [
            "We use artificial intelligence tools to help our team summarise enquiries, keep notes up to date, suggest properties that may suit you and draft replies.",
            "A person at our office reviews and approves every message before it is sent to you. AI does not send messages on its own and does not change your record without a person confirming it.",
            "To do this, the content of your enquiries and correspondence is processed by our AI service provider, Anthropic, whose processing may take place outside Australia, including in the United States.",
          ],
        },
        {
          heading: "Where your information is stored",
          body: [
            "Your information is stored on Amazon Web Services infrastructure in Sydney, Australia, with backups also kept in Sydney.",
            "Some service providers that help us operate process information outside Australia: our AI provider (see above), our speech-to-text provider Deepgram, which may process voice notes our team records in the United States, and Google, which processes website usage information for Google Analytics (see Website analytics). We take reasonable steps to ensure these providers protect your information consistently with the Australian Privacy Principles.",
          ],
        },
        {
          heading: "Who we share it with",
          body: [
            "We share your information only as needed to provide our services: for example with a vendor, landlord, buyer or tenant in the transaction you are involved in, with conveyancers, and with the service providers described above.",
            "We do not sell your personal information.",
            "We may disclose information where the law requires or authorises it.",
          ],
        },
        {
          heading: "Sharing within our group of businesses",
          body: [
            `${A.name}, AussiAcc, Smart Loanz and Aussie Will all operate under Prospect Business Centre Pty Ltd, and together offer property, accounting, lending and wills services.`,
            "When you give your personal information to any business in the group, it is shared with, held by and may be used by every business in the group. This lets each of them help you without asking for the same details again, and lets them tell you about related services, such as finance for a purchase, tax advice on an investment property, or a will.",
            "Every business in the group handles your information under this policy and the same confidentiality and security rules, and it is not shared outside the group except as this policy describes.",
            "Any business in the group may contact you about its services. You can opt out at any time, using the unsubscribe option in any message or by contacting us, and the opt-out applies across the whole group.",
            "Credit information you provide for a loan is handled by Smart Loanz under its own credit and privacy policy, not by us.",
          ],
        },
        {
          heading: "Marketing and unsubscribing",
          body: [
            "We send marketing only to people who have opted in, and we check that consent again at the moment each message is sent.",
            `You can unsubscribe at any time using the unsubscribe option in any marketing message, by replying STOP to an SMS, or by contacting us at ${A.email}.`,
          ],
        },
        {
          heading: "Access, correction and deletion",
          body: [
            `You can ask to see the information we hold about you, ask us to correct it, or ask us to delete it. Contact ${A.email} or ${A.phone}. We will respond within 30 days.`,
            "We may need to keep some records where the law requires it, for example records of a property transaction. If we cannot meet your request we will tell you why.",
          ],
        },
        {
          heading: "Cookies",
          body: [
            "This website uses cookies it needs to work, such as keeping our staff signed in and protecting forms from automated abuse, and analytics cookies set by Google Analytics (see Website analytics). We do not use advertising or remarketing cookies.",
            "You can block or delete cookies in your browser settings; the public pages will still work.",
          ],
        },
        {
          heading: "Website analytics (Google Analytics)",
          body: [
            "We use Google Analytics, a web analytics service provided by Google LLC, to understand how visitors use our public website: for example which pages are viewed, how visitors arrive (such as from a search engine), the type of device and browser used, the approximate region, and whether an enquiry form was sent or a phone number was tapped.",
            "Google Analytics uses cookies and similar technologies to collect this information. It is collected by Google and may be stored and processed on Google's servers outside Australia, including in the United States. We use it only in aggregate, to improve our website and services.",
            "We do not send Google your name, email address, phone number or anything you type into our forms, and Google Analytics is not used on our client management system. We have not enabled Google's advertising features, and we do not use this information to identify you.",
            "You can stop Google Analytics from collecting information about your visits by installing Google's opt-out browser add-on, or by blocking cookies in your browser. You can read how Google uses information from websites that use its services at the links below.",
          ],
          links: [
            { label: "How Google uses information from sites that use its services", href: "https://policies.google.com/technologies/partner-sites" },
            { label: "Google Analytics opt-out browser add-on", href: "https://tools.google.com/dlpage/gaoptout" },
            { label: "Google Privacy Policy", href: "https://policies.google.com/privacy" },
          ],
        },
        {
          heading: "Security",
          body: [
            "Access to your information is limited to our team and protected by individual sign-in, and changes to records are logged. Information sent to and from this website is encrypted, and stored data is encrypted.",
            "No system is perfectly secure. If a data breach is likely to cause you serious harm, we will notify you and the OAIC as required by the Notifiable Data Breaches scheme.",
          ],
        },
        {
          heading: "How long we keep it",
          body: [
            "We keep your information while it is needed for the purpose we collected it and for as long as the law requires us to keep records, for example agency and transaction records. After that we delete or de-identify it.",
          ],
        },
        {
          heading: "Complaints",
          body: [
            `If you have a concern about how we have handled your information, contact us first at ${A.email}. We will acknowledge it and respond within 30 days.`,
            "If you are not satisfied with our response, you can complain to the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au or on 1300 363 992.",
            "Our general complaints process is on the Complaints page.",
          ],
        },
        {
          heading: "Changes to this policy",
          body: [
            "We may update this policy from time to time. The current version is always the one on this page, with the date it was last updated.",
          ],
        },
      ]}
    />
  );
}
