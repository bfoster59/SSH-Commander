import { describe, it, expect } from "vitest";
import { isFatalTransferError, fullySucceededSources, transferSummary } from "../server-utils";

describe("isFatalTransferError", () => {
  it("treats a user cancel as fatal (aborts the whole job)", () => {
    expect(isFatalTransferError("OPERATION_CANCELLED")).toBe(true);
  });

  it("treats a dropped/expired SSH session as fatal", () => {
    expect(isFatalTransferError("SSH Connection has expired or does not exist. Please reconnect.")).toBe(true);
  });

  it("treats an ordinary per-file error as NON-fatal (record-and-continue)", () => {
    expect(isFatalTransferError("No such file")).toBe(false);
    expect(isFatalTransferError("EACCES: permission denied, open 'x'")).toBe(false);
    expect(isFatalTransferError("EINVAL: invalid argument")).toBe(false);
  });
});

describe("fullySucceededSources (move-delete safety)", () => {
  it("returns all sources when nothing failed", () => {
    expect(fullySucceededSources(["/home/u/vault", "/home/u/notes"], [])).toEqual(["/home/u/vault", "/home/u/notes"]);
  });

  it("keeps a single source if any file under it failed (no data loss)", () => {
    const failures = [{ relPath: "vault/.venv/lib64", reason: "broken symlink (No such file)" }];
    expect(fullySucceededSources(["/home/u/vault"], failures)).toEqual([]);
  });

  it("multi-select: deletes only the fully-succeeded sources", () => {
    const failures = [{ relPath: "notes/bad:name.md", reason: "EINVAL" }];
    expect(fullySucceededSources(["/home/u/vault", "/home/u/notes"], failures)).toEqual(["/home/u/vault"]);
  });

  it("matches a failure that IS the source basename (single-file source)", () => {
    const failures = [{ relPath: "report.pdf", reason: "No such file" }];
    expect(fullySucceededSources(["/home/u/report.pdf"], failures)).toEqual([]);
  });

  it("handles Windows-style backslash relPaths and trailing slashes", () => {
    const failures = [{ relPath: "vault\\sub\\x.md", reason: "EACCES" }];
    expect(fullySucceededSources(["C:\\data\\vault\\", "C:\\data\\other"], failures)).toEqual(["C:\\data\\other"]);
  });

  it("does not false-match a sibling that shares a name prefix", () => {
    // "vault2/..." must NOT cause "vault" to be treated as failed.
    const failures = [{ relPath: "vault2/x.md", reason: "EACCES" }];
    expect(fullySucceededSources(["/home/u/vault", "/home/u/vault2"], failures)).toEqual(["/home/u/vault"]);
  });

  it("INVARIANT: never returns a source that has a failure under it", () => {
    const activePaths = ["/a/one", "/a/two", "/a/three"];
    const failures = [
      { relPath: "two/deep/file.txt", reason: "x" },
      { relPath: "three", reason: "y" },
    ];
    const safe = fullySucceededSources(activePaths, failures);
    expect(safe).toEqual(["/a/one"]);
    for (const p of safe) {
      const base = p.split(/[\\/]/).pop() as string;
      const hasFailureUnder = failures.some(
        (f) => f.relPath === base || f.relPath.startsWith(`${base}/`) || f.relPath.startsWith(`${base}\\`),
      );
      expect(hasFailureUnder).toBe(false);
    }
  });
});

describe("transferSummary", () => {
  it("reports clean success", () => {
    const s = transferSummary({ total: 10, failures: [], move: false });
    expect(s.title).toBe("Successfully Completed");
    expect(s.currentItem).toBe("All items copied successfully! (10 elements)");
  });

  it("uses 'moved' wording for a move", () => {
    expect(transferSummary({ total: 3, failures: [], move: true }).currentItem).toBe(
      "All items moved successfully! (3 elements)",
    );
  });

  it("reports a partial failure with counts and the failed file (the matrix-vault case)", () => {
    const failures = [{ relPath: "matrix-vault/cnc-control-translator/.venv/lib64", reason: "broken symlink (No such file)" }];
    const s = transferSummary({ total: 3430, failures, move: false });
    expect(s.title).toBe("Completed with errors");
    expect(s.currentItem).toContain("3429/3430 copied; 1 failed:");
    expect(s.currentItem).toContain("matrix-vault/cnc-control-translator/.venv/lib64 (broken symlink (No such file))");
  });

  it("truncates to the first 3 failures and notes the remainder", () => {
    const failures = Array.from({ length: 5 }, (_, i) => ({ relPath: `f${i}`, reason: "x" }));
    const s = transferSummary({ total: 10, failures, move: false });
    expect(s.currentItem).toContain("5 failed:");
    expect(s.currentItem).toContain("…and 2 more");
  });

  it("notes that sources were kept on a failed move", () => {
    const failures = [{ relPath: "vault/x", reason: "y" }];
    const s = transferSummary({ total: 5, failures, move: true });
    expect(s.currentItem).toContain("Sources with failures kept.");
  });
});
