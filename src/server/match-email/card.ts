import { z } from "zod";

/** The AI-written project card under a matched-buyer email (0026), validated leniently. */
const t = (n: number) => z.preprocess((v) => String(v ?? "").trim().slice(0, n), z.string());
export const emailCardSchema = z
  .preprocess(
    (v) => (v && typeof v === "object" ? v : null),
    z
      .object({
        title: t(60),
        urgency: z.preprocess((v) => (v == null || v === "" ? null : String(v).trim().slice(0, 140)), z.string().nullable()),
        advantages: z
          .preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({ title: t(40), detail: t(70) })))
          .transform((a) => a.filter((x) => x.title).slice(0, 6)),
      })
      .nullable(),
  )
  .default(null);
