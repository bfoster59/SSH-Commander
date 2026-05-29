import { describe, it, expect } from "vitest";
import { classifyFile } from "../src/lib/classify";

describe("classifyFile", () => {
  it("recognizes images", () => {
    expect(classifyFile("a.png")).toBe("image");
    expect(classifyFile("photo.JPEG")).toBe("image");
    expect(classifyFile("icon.svg")).toBe("image");
  });

  it("recognizes pdf, video, audio", () => {
    expect(classifyFile("doc.PDF")).toBe("pdf");
    expect(classifyFile("clip.mp4")).toBe("video");
    expect(classifyFile("song.mp3")).toBe("audio");
  });

  it("treats everything else as text", () => {
    expect(classifyFile("notes.txt")).toBe("text");
    expect(classifyFile("README")).toBe("text");
    expect(classifyFile("archive.tar.gz")).toBe("text");
  });
});
