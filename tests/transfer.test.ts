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

describe("fullySucceededSources (move-delete safety, index-keyed)", () => {
  it("returns all sources when nothing failed", () => {
    expect(fullySucceededSources(["/home/u/vault", "/home/u/notes"], [])).toEqual(["/home/u/vault", "/home/u/notes"]);
  });

  it("keeps a single source if any file under it failed (no data loss)", () => {
    const failures = [{ relPath: "vault/.venv/lib64", reason: "broken symlink (No such file)", sourceIndex: 0 }];
    expect(fullySucceededSources(["/home/u/vault"], failures)).toEqual([]);
  });

  it("multi-select: deletes only the fully-succeeded sources", () => {
    // index 1 (notes) failed; index 0 (vault) is clean and may be deleted.
    const failures = [{ relPath: "notes/bad:name.md", reason: "EINVAL", sourceIndex: 1 }];
    expect(fullySucceededSources(["/home/u/vault", "/home/u/notes"], failures)).toEqual(["/home/u/vault"]);
  });

  it("is immune to a non-normalized source path (regression for the raw-basename bug)", () => {
    // Source "/home/u/vault/." has basename "." but its files scan to relPath "vault/...".
    // Index-keying ignores the path text entirely, so the failed source is still kept.
    const failures = [{ relPath: "vault/secret.txt", reason: "EACCES", sourceIndex: 0 }];
    expect(fullySucceededSources(["/home/u/vault/."], failures)).toEqual([]);
  });

  it("is immune to two selected sources sharing a basename", () => {
    // index 1 failed; index 0 shares basename "vault" but is clean -> it must be deleted.
    const failures = [{ relPath: "vault/x.md", reason: "EACCES", sourceIndex: 1 }];
    expect(fullySucceededSources(["/a/vault", "/b/vault"], failures)).toEqual(["/a/vault"]);
  });

  it("INVARIANT: returns exactly the sources whose index has no failure", () => {
    const activePaths = ["/a/one", "/a/two", "/a/three"];
    const failures = [
      { relPath: "two/deep/file.txt", reason: "x", sourceIndex: 1 },
      { relPath: "three", reason: "y", sourceIndex: 2 },
    ];
    const safe = fullySucceededSources(activePaths, failures);
    expect(safe).toEqual(["/a/one"]);
    // Ground truth, independent of the production predicate: the kept paths are
    // exactly the activePaths whose index is not in the failed-index set.
    const failedIdx = new Set(failures.map((f) => f.sourceIndex));
    expect(safe).toEqual(activePaths.filter((_p, i) => !failedIdx.has(i)));
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
    const failures = [
      { relPath: "matrix-vault/cnc-control-translator/.venv/lib64", reason: "broken symlink (No such file)", sourceIndex: 0 },
    ];
    const s = transferSummary({ total: 3430, failures, move: false });
    expect(s.title).toBe("Completed with errors");
    expect(s.currentItem).toContain("3429/3430 copied; 1 failed:");
    expect(s.currentItem).toContain("matrix-vault/cnc-control-translator/.venv/lib64 (broken symlink (No such file))");
  });

  it("truncates to the first 3 failures and notes the remainder", () => {
    const failures = Array.from({ length: 5 }, (_, i) => ({ relPath: `f${i}`, reason: "x", sourceIndex: 0 }));
    const s = transferSummary({ total: 10, failures, move: false });
    expect(s.currentItem).toContain("5 failed:");
    expect(s.currentItem).toContain("…and 2 more");
  });

  it("notes that sources were kept on a failed move", () => {
    const failures = [{ relPath: "vault/x", reason: "y", sourceIndex: 0 }];
    const s = transferSummary({ total: 5, failures, move: true });
    expect(s.currentItem).toContain("Sources with failures kept.");
  });
});
