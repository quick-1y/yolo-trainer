import { describe, expect, it } from "vitest";

import { classifyFiles, extensionOf } from "./imageFiles";

const LIMITS = {
  maxUploadBytes: 1000,
  acceptedExtensions: ["jpg", "jpeg", "png", "webp", "bmp"],
};

function file(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

describe("extensionOf", () => {
  it("lower-cases the text after the last dot", () => {
    expect(extensionOf("photo.JPG")).toBe("jpg");
    expect(extensionOf("archive.tar.PNG")).toBe("png");
  });

  it("returns an empty string when there is no extension", () => {
    expect(extensionOf("README")).toBe("");
  });
});

describe("classifyFiles", () => {
  it("accepts supported extensions regardless of case and keeps input order", () => {
    const files = [file("photo.JPG"), file("a.jpeg"), file("b.webp")];
    const { accepted, rejected } = classifyFiles(files, LIMITS);

    expect(accepted.map((f) => f.name)).toEqual(["photo.JPG", "a.jpeg", "b.webp"]);
    expect(rejected).toEqual([]);
  });

  it("rejects unsupported extensions with the 'unsupported' code", () => {
    const { accepted, rejected } = classifyFiles(
      [file("notes.txt"), file("anim.gif"), file("README")],
      LIMITS,
    );

    expect(accepted).toEqual([]);
    expect(rejected).toEqual([
      { name: "notes.txt", code: "unsupported" },
      { name: "anim.gif", code: "unsupported" },
      { name: "README", code: "unsupported" },
    ]);
  });

  it("rejects images larger than the size limit with the 'tooLarge' code", () => {
    const { accepted, rejected } = classifyFiles(
      [file("small.png", 1000), file("big.png", 1001)],
      LIMITS,
    );

    expect(accepted.map((f) => f.name)).toEqual(["small.png"]);
    expect(rejected).toEqual([{ name: "big.png", code: "tooLarge" }]);
  });

  it("accounts for every submitted file", () => {
    const files = Array.from({ length: 50 }, (_, i) =>
      file(i % 2 === 0 ? `a${i}.png` : `a${i}.txt`),
    );
    const { accepted, rejected } = classifyFiles(files, LIMITS);

    expect(accepted.length + rejected.length).toBe(50);
  });
});
