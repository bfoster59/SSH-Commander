import { describe, it, expect } from "vitest";
import { shq, archiveBaseName, mimeForPath } from "../server-utils";

describe("shq (POSIX shell quoting)", () => {
  it("wraps a plain token in single quotes", () => {
    expect(shq("foo")).toBe("'foo'");
  });

  it("keeps spaces inside one token", () => {
    expect(shq("a b c")).toBe("'a b c'");
  });

  it("escapes embedded single quotes", () => {
    expect(shq("it's")).toBe("'it'\\''s'");
  });

  // The whole point: shell metacharacters must NOT be interpretable.
  it("neutralizes command substitution and other metacharacters", () => {
    expect(shq("$(rm -rf /)")).toBe("'$(rm -rf /)'");
    expect(shq("`reboot`")).toBe("'`reboot`'");
    expect(shq("a; rm -rf ~")).toBe("'a; rm -rf ~'");
    expect(shq("$HOME && evil")).toBe("'$HOME && evil'");
  });

  it("produces a string with no unescaped single quote (always safe to embed)", () => {
    for (const input of ["plain", "wi'th", "$(x)", "a\nb", "''''"]) {
      const out = shq(input);
      expect(out.startsWith("'")).toBe(true);
      expect(out.endsWith("'")).toBe(true);
      // Every literal quote in the original is rendered as the '\'' sequence.
      const literalQuotes = (input.match(/'/g) || []).length;
      expect((out.match(/\\'/g) || []).length).toBe(literalQuotes);
    }
  });
});

describe("archiveBaseName", () => {
  it("strips known archive extensions", () => {
    expect(archiveBaseName("project.zip")).toBe("project");
    expect(archiveBaseName("backup.tar.gz")).toBe("backup");
    expect(archiveBaseName("data.tgz")).toBe("data");
    expect(archiveBaseName("blob.gz")).toBe("blob");
  });

  it("is case-insensitive", () => {
    expect(archiveBaseName("PHOTO.ZIP")).toBe("PHOTO");
  });

  it("leaves non-archives untouched", () => {
    expect(archiveBaseName("notes.txt")).toBe("notes.txt");
    expect(archiveBaseName("noext")).toBe("noext");
  });
});

describe("mimeForPath", () => {
  it("maps known extensions", () => {
    expect(mimeForPath("a.png")).toBe("image/png");
    expect(mimeForPath("clip.mp4")).toBe("video/mp4");
    expect(mimeForPath("doc.pdf")).toBe("application/pdf");
  });

  it("is case-insensitive on the extension", () => {
    expect(mimeForPath("DOC.PDF")).toBe("application/pdf");
  });

  it("falls back to octet-stream for unknown types", () => {
    expect(mimeForPath("mystery.xyz")).toBe("application/octet-stream");
    expect(mimeForPath("noextension")).toBe("application/octet-stream");
  });
});
