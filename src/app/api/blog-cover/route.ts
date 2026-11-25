import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { mediaUrl, putMedia, sniffImage } from "@/server/media/s3";

/**
 * Upload a blog cover photo (2026-11-25). Signed-in staff only. The bytes decide the
 * type (sniffImage), not the browser's word; JPEG, PNG or WebP, up to 8 MB. Stored in
 * the private bucket and served through /media/<key>, like listing photos.
 */
const MAX = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const s = await auth();
  const tenantId = s?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await req.formData();
  const f = form.get("file");
  if (!f || typeof f !== "object" || !("arrayBuffer" in f)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (f.size > MAX) return NextResponse.json({ error: "That photo is over 8 MB." }, { status: 413 });
  const bytes = new Uint8Array(await f.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return NextResponse.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 415 });
  const key = `t/${tenantId}/b/${randomUUID()}.${kind.ext}`;
  await putMedia(key, bytes, kind.type);
  return NextResponse.json({ ok: true, url: mediaUrl(key) });
}
