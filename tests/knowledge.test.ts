import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ withTenant: vi.fn() }));
vi.mock("@/server/ai/embeddings", () => ({
  embedDocuments: vi.fn(),
  embedQuery: vi.fn(),
  embeddingsAvailable: () => false,
  toVectorLiteral: (v: number[]) => `[${v}]`,
}));

const { chunkText, extractText } = await import("@/server/knowledge");

describe("knowledge base chunking", () => {
  it("splits legislation by section and keeps section numbers for citations", () => {
    const text = [
      "Land Agents Act 1994",
      "",
      "6—Requirement to be registered",
      "A person must not carry on business as an agent unless registered.",
      "",
      "24A—Estimated selling price",
      "An agent must not underquote the price a property is likely to sell for. The estimate must be reasonable.",
    ].join("\n");
    const chunks = chunkText(text, "legal");
    const s24 = chunks.find((c) => c.section === "24A");
    expect(s24?.heading).toBe("Estimated selling price");
    expect(s24?.text).toMatch(/underquote/);
    expect(chunks.find((c) => c.section === "6")?.text).toMatch(/registered/);
  });

  it("splits office documents by headings and repeats the heading on long sections", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} about the listing checklist with enough words to count.`.repeat(4)).join("\n\n");
    const chunks = chunkText(`# Fees\nOur commission is 2% plus GST.\n\n# Listing checklist\n${long}`, "office");
    expect(chunks[0]).toMatchObject({ heading: "Fees" });
    const listing = chunks.filter((c) => c.heading === "Listing checklist");
    expect(listing.length).toBeGreaterThan(1);
    expect(listing.every((c) => c.text.length <= 2400)).toBe(true);
  });

  it("reads plain text files", async () => {
    const text = await extractText({ name: "a.txt", kind: "text", base64: Buffer.from("Hello office").toString("base64") });
    expect(text).toBe("Hello office");
  });
});
