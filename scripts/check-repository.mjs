import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { execFileSync } from "node:child_process";

let candidateOutput;
try {
  candidateOutput = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );
} catch (error) {
  // Some restricted runners report EPERM after a read-only Git process has
  // produced complete stdout. Accept that output only when it contains this
  // repository's root manifest; genuine spawn failures remain fatal.
  if (
    typeof error === "object" &&
    error !== null &&
    "stdout" in error &&
    typeof error.stdout === "string" &&
    error.stdout.includes("package.json\0")
  ) {
    candidateOutput = error.stdout;
  } else {
    throw error;
  }
}

const trackedFiles = candidateOutput.split("\0").filter(Boolean);

const forbiddenPaths = [
  /(^|\/)\.DS_Store$/u,
  /(^|\/)\.env(?:\.|$)/u,
  /(^|\/)(?:coverage|dist|node_modules|playwright-report|test-results)\//u,
  /\.tsbuildinfo$/u,
];

const allowedEnvironmentTemplate = ".env.example";
const pathViolations = trackedFiles.filter(
  (file) =>
    file !== allowedEnvironmentTemplate &&
    forbiddenPaths.some((pattern) => pattern.test(file)),
);

const textExtensions = new Set([
  "",
  ".css",
  ".example",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const secretPatterns = [
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
  { label: "Razorpay live key", pattern: /rzp_live_[A-Za-z0-9]+/u },
  {
    label: "model API key",
    pattern: /sk-(?:(?:proj|ant)-)?[A-Za-z0-9_-]{20,}/u,
  },
  { label: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/u },
];

const secretViolations = [];
for (const file of trackedFiles) {
  if (!textExtensions.has(extname(file))) continue;

  const contents = await readFile(file, "utf8");
  for (const { label, pattern } of secretPatterns) {
    if (pattern.test(contents)) secretViolations.push(`${file}: ${label}`);
  }
}

const violations = [...pathViolations, ...secretViolations];
if (violations.length > 0) {
  process.stderr.write(
    `Repository hygiene check failed:\n${violations.join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Repository hygiene check passed (${String(trackedFiles.length)} candidate files).\n`,
  );
}
