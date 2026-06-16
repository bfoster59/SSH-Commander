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

// ---- Transfer-worker pure helpers (unit-tested in tests/transfer.test.ts) ----

export interface TransferFailure {
  relPath: string;
  reason: string;
  /** Index into the transfer's activePaths that this entry came from. */
  sourceIndex: number;
}

/**
 * Whether a transfer error should abort the WHOLE job rather than be recorded as
 * one per-file failure. A user cancel, or the SSH session dropping/expiring
 * mid-batch, must fail the job honestly — continuing would record every remaining
 * file as a bogus per-file failure and mask the real cause.
 */
export function isFatalTransferError(message: string): boolean {
  return message === "OPERATION_CANCELLED" || message.includes("expired or does not exist");
}

/**
 * For a `move`, decide which top-level source paths are safe to delete: ONLY those
 * whose every descendant copied successfully. A source with ANY failed file under
 * it is kept, so a move can never delete a file that did not make it across.
 * Matched by source INDEX — each scanned entry, and therefore each failure,
 * carries the index of its originating activePaths element. Index-keying avoids
 * both the path-normalization mismatch (raw basename vs the scan's resolved
 * prefix) and the duplicate-basename case.
 */
export function fullySucceededSources(activePaths: string[], failures: TransferFailure[]): string[] {
  return activePaths.filter((_p, i) => !failures.some((f) => f.sourceIndex === i));
}

/** Build the final job status (title + currentItem) from the transfer outcome. */
export function transferSummary(opts: {
  total: number;
  failures: TransferFailure[];
  move: boolean;
}): { title: string; currentItem: string } {
  const { total, failures, move } = opts;
  const verb = move ? "moved" : "copied";
  if (failures.length === 0) {
    return {
      title: "Successfully Completed",
      currentItem: `All items ${verb} successfully! (${total} elements)`,
    };
  }
  const shown = failures.slice(0, 3).map((f) => `${f.relPath} (${f.reason})`).join("; ");
  const more = failures.length > 3 ? ` …and ${failures.length - 3} more` : "";
  const kept = move ? " Sources with failures kept." : "";
  return {
    title: "Completed with errors",
    currentItem: `${total - failures.length}/${total} ${verb}; ${failures.length} failed: ${shown}${more}.${kept}`,
  };
}
