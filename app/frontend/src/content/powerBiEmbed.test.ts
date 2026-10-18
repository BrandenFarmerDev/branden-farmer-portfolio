import { describe, expect, it } from "vitest";
import { getPowerBiEmbedUrl, getRuntimePowerBiEmbedUrl } from "./powerBiEmbed";

describe("Power BI public embed URL", () => {
  it("accepts the Microsoft Publish to web URL and its default HTTPS port", () => {
    expect(getPowerBiEmbedUrl("https://app.powerbi.com/view?r=public-token")).toBe(
      "https://app.powerbi.com/view?r=public-token",
    );
    expect(getPowerBiEmbedUrl("https://app.powerbi.com:443/view?r=public-token")).toBe(
      "https://app.powerbi.com/view?r=public-token",
    );
  });

  it.each([
    " https://app.powerbi.com/view?r=public-token ",
    "http://app.powerbi.com/view?r=public-token",
    "https://user@app.powerbi.com/view?r=public-token",
    "https://app.powerbi.com:8443/view?r=public-token",
    "https://app.powerbi.com/reportEmbed?reportId=public-token",
    "https://app.powerbi.com/view?r=public-token&r=another-token",
    "https://app.powerbi.com/view?r=",
    "https://app.powerbi.com/view?r=%",
    "https://app.powerbi.com/view?r=%FF",
    "https://app.powerbi.com/view\nr=public-token",
    "https://app.powerbi.com/view?r=public-token\t",
    "https://app.powerbi.com/view?workspace=public-token",
  ])("rejects unsafe or unsupported URL %s", (value) => {
    expect(() => getPowerBiEmbedUrl(value)).toThrow(/Publish to web URL|valid encoded Power BI public token/);
  });

  it("keeps an unconfigured or invalid runtime value from crashing unrelated routes", () => {
    expect(getRuntimePowerBiEmbedUrl(undefined)).toBeUndefined();
    expect(getRuntimePowerBiEmbedUrl("https://evil.example/view?r=secret")).toBeUndefined();
    expect(getRuntimePowerBiEmbedUrl("https://app.powerbi.com/view?r=public-token")).toBe(
      "https://app.powerbi.com/view?r=public-token",
    );
  });
});
