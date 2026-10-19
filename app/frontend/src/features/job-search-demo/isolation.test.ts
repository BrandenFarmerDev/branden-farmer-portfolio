import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import homeSource from "../../pages/HomePage.tsx?raw";
import workSource from "../../pages/WorkPage.tsx?raw";
import sitemap from "../../../public/sitemap.xml?raw";
import demoCss from "./demo.css?raw";

const modules = import.meta.glob<string>("./**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const productionSources = Object.entries(modules).filter(([path]) => !/\.test\.tsx?$/.test(path));

describe("demo isolation", () => {
  it("covers the whole feature with the source scan", () => { expect(productionSources.length).toBeGreaterThan(30); });
  it.each([
    ["fetch", /\bfetch\s*\(/], ["XMLHttpRequest", /XMLHttpRequest/], ["sendBeacon", /sendBeacon/], ["WebSocket", /WebSocket|EventSource/], ["browser storage", /localStorage|sessionStorage|indexedDB|document\.cookie/],
    ["navigation to other origins", /window\.open|location\.assign|location\.href\s*=/], ["raw HTML injection", /dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML/], ["dynamic code", /\beval\s*\(|new Function/],
    ["private integrations", /VITE_API_BASE_URL|\/api\/|oauth|accounts\.google|googleapis|graph\.microsoft/i], ["service workers", /serviceWorker/],
  ])("has no %s in production sources", (_name, pattern) => {
    expect(productionSources.filter(([, source]) => pattern.test(source)).map(([path]) => path)).toEqual([]);
  });
  it("contains no real-looking mailbox addresses other than the reserved example domain", () => {
    const addresses = productionSources.flatMap(([, source]) => source.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []);
    expect(addresses.filter((address) => !address.endsWith("@example.com"))).toEqual([]);
  });
  it("is reached only through a lazy import so Home and Work never bundle it", () => {
    expect(appSource).toMatch(/lazy\(\(\) => import\("\.\/features\/job-search-demo\/JobSearchDemo"\)/);
    expect(appSource.match(/features\/job-search-demo/g)).toHaveLength(1);
    expect(homeSource + workSource).not.toContain("features/job-search-demo");
  });
  it("scopes every top-level style rule to the demo root", () => {
    const stripped = demoCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const preludes: string[] = []; let depth = 0; let start = 0;
    for (let index = 0; index < stripped.length; index++) {
      if (stripped[index] === "{") { if (depth === 0) preludes.push(stripped.slice(start, index).trim()); depth++; }
      else if (stripped[index] === "}") { depth--; if (depth === 0) start = index + 1; }
    }
    expect(preludes.filter((prelude) => prelude !== ".jsd-app" && !prelude.startsWith("@keyframes"))).toEqual([]);
    expect(demoCss).not.toMatch(/:root|\.qe-app|\bhtml\b|\bbody\b/);
  });
  it("is listed in the sitemap", () => { expect(sitemap).toContain("https://brandenfarmer.com/projects/job-search-intelligence"); });
});
