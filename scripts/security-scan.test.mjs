import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("the scanner rejects credentials in settings and built artifacts while allowing only reviewed audience IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "portfolio-gitleaks-test-"));
  const settingsPath = join(directory, "app", "backend", "wrangler.toml");
  const artifactPath = join(directory, "app", "frontend", "dist", "assets", "fixture.js");
  const reportPath = join(directory, "report.json");
  const defaultReportPath = join(directory, "default-report.json");
  try {
    const syntheticToken = ["ghp", "_", "aB3dE6gH9jK2mN5pQ8sT1vX4zA7cD0fG3hIx"].join("");
    const syntheticSettingsToken = ["ghp", "_", "X7mQ2nR5vT8kP3aD6fG9hJ1wZ4cB0yE2sLq"].join("");
    await mkdir(join(directory, "app", "backend"), { recursive: true });
    await mkdir(join(directory, "app", "frontend", "dist", "assets"), { recursive: true });
    const reviewedSettings = await readFile("app/backend/wrangler.toml", "utf8");
    await writeFile(settingsPath, `${reviewedSettings}\nTEST_TOKEN="${syntheticSettingsToken}"\n`);
    await writeFile(artifactPath, `const token = "${syntheticToken}";\n`);
    const executable = process.env.GITLEAKS_BINARY || "gitleaks";
    const defaultResult = spawnSync(executable, [
      "dir", "--redact", "--no-banner", "--no-color", "--report-format", "json",
      "--report-path", defaultReportPath, directory,
    ], { encoding: "utf8" });
    assert.ifError(defaultResult.error);
    const defaultFindings = JSON.parse(await readFile(defaultReportPath, "utf8"));
    assert.ok(defaultFindings.some(({ File }) => File.endsWith("app/backend/wrangler.toml")), "fixture must trigger the default scanner in the settings file");
    const result = spawnSync(executable, [
      "dir", "--config", ".gitleaks.toml", "--redact", "--no-banner", "--no-color",
      "--report-format", "json", "--report-path", reportPath, directory,
    ], { encoding: "utf8" });

    assert.ifError(result.error);
    assert.equal(result.status, 1, "a synthetic credential must fail the scanner");
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(syntheticToken));
    const findings = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(findings.length, 2, JSON.stringify(findings.map(({ File, RuleID }) => ({ File, RuleID }))));
    assert.ok(findings.some(({ RuleID, File }) => RuleID === "generic-api-key" && File.endsWith("app/backend/wrangler.toml")));
    assert.ok(findings.some(({ RuleID, File }) => RuleID === "github-pat" && File.endsWith("app/frontend/dist/assets/fixture.js")));
    assert.ok(findings.some(({ File }) => File.endsWith("app/frontend/dist/assets/fixture.js")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
