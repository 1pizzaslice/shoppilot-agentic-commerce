import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
]);

const packageRoots = [];
const store = "node_modules/.pnpm";
for (const entry of await readdir(store, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const modules = join(store, entry.name, "node_modules");
  let packages;
  try {
    packages = await readdir(modules, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const packageEntry of packages) {
    if (!packageEntry.isDirectory() && !packageEntry.isSymbolicLink()) continue;
    if (packageEntry.name.startsWith("@")) {
      const scope = join(modules, packageEntry.name);
      for (const scoped of await readdir(scope, { withFileTypes: true })) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          packageRoots.push(join(scope, scoped.name));
        }
      }
    } else {
      packageRoots.push(join(modules, packageEntry.name));
    }
  }
}

const licenses = new Set();
const rejected = [];
for (const packageRoot of packageRoots) {
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
  } catch {
    continue;
  }
  if (typeof manifest !== "object" || manifest === null) continue;
  const name = typeof manifest.name === "string" ? manifest.name : packageRoot;
  const license =
    typeof manifest.license === "string" ? manifest.license : "UNKNOWN";
  licenses.add(license);
  if (!allowedLicenses.has(license)) rejected.push(`${name}: ${license}`);
}

if (rejected.length > 0) {
  process.stderr.write(
    `Unreviewed dependency licenses:\n${rejected.join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Dependency license check passed (${[...licenses].sort().join(", ")}).\n`,
  );
}
