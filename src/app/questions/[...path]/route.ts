/**
 * Serve question assets (images, audio) from `content/questions/`.
 *
 * Why a route handler instead of `public/`?
 *   We want YAML files and their referenced assets to live together inside
 *   `content/questions/board_N/` — that way each board is a self-contained
 *   bundle you can copy around or edit without juggling two directories.
 *
 * URLs in the YAML look like `/questions/board_3/eren.avif`, which this
 * handler resolves to `D:\Projects\Quizduell\content\questions\board_3\eren.avif`
 * and streams back to the client with the right Content-Type.
 *
 * Path-traversal guard: resolves the requested path and verifies the result
 * still lives under the content/questions/ root. Anything trying to escape
 * (../../etc/passwd, absolute paths, symlinks pointing outside) gets 404'd.
 */

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { NextResponse } from "next/server";

const CONTENT_ROOT = resolve(process.cwd(), "content", "questions");

// Minimal MIME map — covers everything we'd reasonably embed in a question.
const MIME: Record<string, string> = {
  // images
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  // audio
  ".mp3":  "audio/mpeg",
  ".ogg":  "audio/ogg",
  ".oga":  "audio/ogg",
  ".wav":  "audio/wav",
  ".m4a":  "audio/mp4",
  ".aac":  "audio/aac",
  ".flac": "audio/flac",
  // video (in case anyone uses it)
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path || path.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Join + resolve relative to the content root, then verify containment.
  const requested = resolve(join(CONTENT_ROOT, ...path));
  if (
    requested !== CONTENT_ROOT &&
    !requested.startsWith(CONTENT_ROOT + sep)
  ) {
    // Path traversal attempt (e.g. ../../something).
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!existsSync(requested)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const st = statSync(requested);
  if (!st.isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = extname(requested).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  const buf = await readFile(requested);
  // Wrap Buffer in Uint8Array for the Web Response body, which is what
  // Next.js's runtime expects.
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":   contentType,
      "Content-Length": String(st.size),
      // Cache aggressively — question assets are immutable per board.
      "Cache-Control":  "public, max-age=3600, immutable",
    },
  });
}
