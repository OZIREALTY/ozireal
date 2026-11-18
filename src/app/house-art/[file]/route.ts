import sharp from "sharp";
import { HOUSE_KINDS, houseArtSvg } from "@/lib/house-art-svg";

/**
 * /house-art/<kind>-<index>.png (2026-11-18): the New Homes page's drawn homes as
 * PNGs, for property emails (mail clients do not show SVG). Public, no data, cached long.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = file.match(/^([a-z-]+)-(\d{1,3})\.png$/);
  if (!m || !HOUSE_KINDS[m[1]]) return new Response("Not found", { status: 404 });
  const png = await sharp(Buffer.from(houseArtSvg(m[1], Number(m[2]))))
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" },
  });
}
