// Exercise the actual pre-paint script, which runs before React mounts the header.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");
const sourceDocument = new DOMParser().parseFromString(html, "text/html");
const script = sourceDocument.querySelector("head > script:not([src])")?.textContent;
if (!script) throw new Error("The pre-paint theme script is missing from index.html.");

describe("pre-paint theme", () => {
  it.each([
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["system", true, "dark"],
    [null, false, "light"],
    ["invalid", true, "dark"],
    ["blocked", true, "dark"],
  ])("resolves %s with system dark=%s before paint", (saved, systemDark, expected) => {
    const document = { documentElement: { dataset: { theme: "" } } };
    runInNewContext(script, {
      document,
      localStorage: { getItem: () => {
        if (saved === "blocked") throw new Error("storage blocked");
        return saved;
      } },
      window: { matchMedia: () => ({ matches: systemDark }) },
    });
    expect(document.documentElement.dataset.theme).toBe(expected);
  });
});
