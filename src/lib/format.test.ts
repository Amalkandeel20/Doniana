import { describe, expect, it } from "vitest";
import { instagramHandle } from "./format";

describe("instagramHandle", () => {
  it("drops tracking parameters copied from the Instagram app", () => {
    expect(instagramHandle("https://www.instagram.com/donianaassadi?rpxt=MXZu%3D%3D&utm_source=qr")).toBe("@donianaassadi");
    expect(instagramHandle("https://instagram.com/doniana/")).toBe("@doniana");
  });

  it("falls back to the raw text when it is not a link", () => {
    expect(instagramHandle("not a url")).toBe("not a url");
  });
});
