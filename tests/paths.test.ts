import { describe, it, expect } from "vitest";
import { separatorFor, joinPath, baseName, parentPath } from "../src/lib/paths";

describe("separatorFor", () => {
  it("detects POSIX vs Windows separators", () => {
    expect(separatorFor("/home/user")).toBe("/");
    expect(separatorFor("C:\\Users\\bob")).toBe("\\");
    expect(separatorFor("C:/Users/bob")).toBe("/"); // any '/' means POSIX-style join
  });
});

describe("joinPath", () => {
  it("joins without doubling the separator", () => {
    expect(joinPath("/home", "file")).toBe("/home/file");
    expect(joinPath("/home/", "file")).toBe("/home/file");
    expect(joinPath("C:\\a", "b")).toBe("C:\\a\\b");
    expect(joinPath("C:\\a\\", "b")).toBe("C:\\a\\b");
  });
});

describe("baseName", () => {
  it("returns the last segment, ignoring trailing separators", () => {
    expect(baseName("/a/b/c.txt")).toBe("c.txt");
    expect(baseName("/a/b/")).toBe("b");
    expect(baseName("C:\\a\\b")).toBe("b");
    expect(baseName("file")).toBe("file");
  });
});

describe("parentPath", () => {
  it("walks up POSIX paths", () => {
    expect(parentPath("/home/user/file")).toBe("/home/user");
    expect(parentPath("/home")).toBe("/");
    expect(parentPath("/")).toBe("/");
  });

  it("walks up Windows paths", () => {
    expect(parentPath("C:\\Users\\bob")).toBe("C:\\Users");
    expect(parentPath("C:\\")).toBe("C:\\");
  });
});
