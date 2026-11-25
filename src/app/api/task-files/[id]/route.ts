import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenant } from "@/db";
import { taskAttachments, tasks } from "@/db/schema";
import { getMedia, putMedia } from "@/server/media/s3";

/**
 * Task attachments (owner, 2026-11-25). Signed-in staff only, behind the private-path
 * gate and checked again here.
 *
 *   POST /api/task-files/<taskId>      multipart "file" (one or more): store each
 *   GET  /api/task-files/<attachmentId> open or download one
 *
 * Files go to the private media bucket under t/<tenant>/task/<task>/<uuid>; the
 * bucket is never public, so the only way to a file is this route.
 */
const MAX = 20 * 1024 * 1024;
const uuid = /^[0-9a-f-]{36}$/i;
const OK_TYPES = /^(application\/pdf|image\/(png|jpeg|webp|gif|heic)|text\/plain|text\/csv|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|vnd\.ms-powerpoint|zip))$/;

async function tenant() {
  const s = await auth();
  return s?.user?.tenantId ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await tenant();
  if (!tenantId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [task] = await withTenant(tenantId, (tx) => tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).limit(1));
  if (!task) return NextResponse.json({ error: "That task no longer exists." }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f);
  if (!files.length) return NextResponse.json({ error: "No file." }, { status: 400 });

  const saved: { id: string; fileName: string }[] = [];
  for (const f of files.slice(0, 10)) {
    if (f.size > MAX) return NextResponse.json({ error: `${f.name} is over 20 MB.` }, { status: 413 });
    const type = f.type || "application/octet-stream";
    if (!OK_TYPES.test(type)) return NextResponse.json({ error: `${f.name}: that file type is not accepted.` }, { status: 415 });
    const key = `t/${tenantId}/task/${id}/${randomUUID()}`;
    await putMedia(key, new Uint8Array(await f.arrayBuffer()), type);
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(taskAttachments)
        .values({ tenantId, taskId: id, s3Key: key, fileName: f.name.slice(0, 200), contentType: type, sizeBytes: f.size })
        .returning({ id: taskAttachments.id, fileName: taskAttachments.fileName }),
    );
    saved.push(row);
  }
  return NextResponse.json({ ok: true, saved });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await tenant();
  if (!tenantId) return new NextResponse("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!uuid.test(id)) return new NextResponse("Not found", { status: 404 });
  const [a] = await withTenant(tenantId, (tx) => tx.select().from(taskAttachments).where(eq(taskAttachments.id, id)).limit(1));
  if (!a) return new NextResponse("Not found", { status: 404 });
  const m = await getMedia(a.s3Key);
  if (!m.body) return new NextResponse("Not found", { status: 404 });
  const body = m.body as unknown as { transformToWebStream: () => ReadableStream };
  const inline = /^(application\/pdf|image\/|text\/plain)/.test(a.contentType);
  return new NextResponse(body.transformToWebStream(), {
    headers: {
      "content-type": a.contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...(m.length ? { "content-length": String(m.length) } : {}),
    },
  });
}
