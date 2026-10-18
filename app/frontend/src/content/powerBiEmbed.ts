const POWER_BI_ORIGIN = "https://app.powerbi.com";

export function getPowerBiEmbedUrl(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("VITE_POWER_BI_EMBED_URL must be a valid Power BI Publish to web URL without surrounding whitespace.");
  }
  const configuredUrl = value;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error("VITE_POWER_BI_EMBED_URL must be a valid public Power BI URL.");
  }

  if (
    /%(?![0-9a-fA-F]{2})/.test(configuredUrl) ||
    parsedUrl.protocol !== "https:" ||
    parsedUrl.origin !== POWER_BI_ORIGIN ||
    parsedUrl.username !== "" ||
    parsedUrl.password !== "" ||
    parsedUrl.pathname !== "/view" ||
    parsedUrl.hash !== "" ||
    parsedUrl.searchParams.size !== 1 ||
    !parsedUrl.searchParams.get("r")?.trim()
  ) {
    throw new Error("VITE_POWER_BI_EMBED_URL must be a Power BI Publish to web URL in the form https://app.powerbi.com/view?r=… .");
  }

  const rawQuery = configuredUrl.slice(configuredUrl.indexOf("?") + 1);
  const queryValueStart = rawQuery.indexOf("=") + 1;
  const rawToken = queryValueStart > 0 ? rawQuery.slice(queryValueStart) : undefined;
  try {
    if (rawToken === undefined || !decodeURIComponent(rawToken.replaceAll("+", " ")).trim()) {
      throw new Error("Missing Power BI public token.");
    }
  } catch {
    throw new Error("VITE_POWER_BI_EMBED_URL must contain a valid encoded Power BI public token.");
  }

  return parsedUrl.toString();
}

export function getRuntimePowerBiEmbedUrl(value: string | undefined): string | undefined {
  try {
    return getPowerBiEmbedUrl(value);
  } catch {
    return undefined;
  }
}

