import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { mediaUrl, putMedia, sniffImage } from "@/server/media/s3";

/**
 * Free stock cover photos from Pixabay (owner-approved preview, 2026-11-25).
 * GET ?q=&page= searches; POST {id} copies the chosen photo into our own bucket
 * (Pixabay links expire) and returns its credit. Signed-in staff only. The key
 * lives in /etc/ozirealty/env only, never in the repository.
 */
const MAX = 8 * 1024 * 1024;
const API = "https://pixabay.com/api/";

type Hit = { id: number; webformatURL: string; largeImageURL: string; user: string; tags: string };

async function pixabay(params: Record<string, string>) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error("Photo search is not set up on the server.");
  const qs = new URLSearchParams({ key, image_type: "photo", safesearch: "true", ...params });
  const r = await fetch(`${API}?${qs}`, { cache: "no-store" });
  if (!r.ok) throw new Error("Pixabay did not answer. Try again in a minute.");
  return (await r.json()) as { totalHits: number; hits: Hit[] };
}

export async function GET(req: NextRequest) {
  const s = await auth();
  if (!s?.user?.tenantId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = String(Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1)));
  if (!q) return NextResponse.json({ photos: [], more: false });
  try {
    const j = await pixabay({ q, page, per_page: "6", orientation: "horizontal" });
    return NextResponse.json({
      photos: j.hits.map((h) => ({ id: h.id, thumb: h.webformatURL, user: h.user, tags: h.tags })),
      more: Number(page) * 6 < j.totalHits,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const s = await auth();
  const tenantId = s?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "No photo chosen." }, { status: 400 });
  try {
    const j = await pixabay({ id: String(id) });
    const h = j.hits[0];
    if (!h) return NextResponse.json({ error: "That photo is no longer on Pixabay." }, { status: 404 });
    const r = await fetch(h.largeImageURL, { cache: "no-store" });
    if (!r.ok) throw new Error("The photo did not download. Try another.");
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > MAX) throw new Error("That photo is too large. Try another.");
    const kind = sniffImage(bytes);
    if (!kind) throw new Error("That photo is not a JPEG, PNG or WebP. Try another.");
    const key = `t/${tenantId}/b/${randomUUID()}.${kind.ext}`;
    await putMedia(key, bytes, kind.type);
    return NextResponse.json({ ok: true, url: mediaUrl(key), credit: `${h.user.slice(0, 80)} / Pixabay`, tags: h.tags.slice(0, 200) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
