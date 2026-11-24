import { NextResponse, type NextRequest } from "next/server";
import { getMedia } from "@/server/media/s3";
import { BOOK_FILENAME, BOOK_KEY, readBookToken } from "@/server/book/book";

/**
 * The free book's PDF, for a signed link only (owner, 2026-11-24). Inline by default,
 * so the reading page can render it; ?download=1 saves it as a file.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const t = readBookToken((await params).token);
  if (!t) return new NextResponse("This link is not valid.", { status: 404 });
  try {
    const m = await getMedia(BOOK_KEY);
    if (!m.body) return new NextResponse("Not found", { status: 404 });
    const body = m.body as unknown as { transformToWebStream: () => ReadableStream };
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(body.transformToWebStream(), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${BOOK_FILENAME}"`,
        "cache-control": "private, max-age=86400",
        ...(m.length ? { "content-length": String(m.length) } : {}),
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
