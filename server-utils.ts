import path from "path";

/**
 * Single-quote escape for POSIX remote shells. Wrapping a value in single
 * quotes and replacing each `'` with `'\''` turns it into one inert shell
 * token, so metacharacters ($(), backticks, $VAR, spaces, ;, &&, …) are never
 * interpreted. Use this for EVERY untrusted value placed into a remote command.
 */
export function shq(s: string): string {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

/** Strip a known archive extension to derive an extraction folder name. */
export function archiveBaseName(name: string): string {
  return name.replace(/\.(zip|tar\.gz|tgz|gz)$/i, "");
}

// Raw byte streaming for binary previews (images, PDFs, etc.).
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".txt": "text/plain", ".json": "application/json",
};

export function mimeForPath(p: string): string {
  const ext = path.extname(p).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

/**
 * Maximum size (bytes) we will read into memory as a UTF-8 string for the
 * viewer/editor. Larger files are rejected with a clear error instead of
 * blowing up the server's heap.
 */
export const MAX_TEXT_READ_BYTES = 10 * 1024 * 1024; // 10 MB
