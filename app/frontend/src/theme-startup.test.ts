// Exercise the actual pre-paint script, which runs before React mounts the header.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

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
