import { readFile } from "node:fs/promises";

const compose = await readFile("docker-compose.yml", "utf8");
const failures = [];
if (/\bprivileged:\s*true\b/u.test(compose))
  failures.push("privileged container");
if (/\bnetwork_mode:\s*host\b/u.test(compose)) failures.push("host networking");
if (/image:\s*[^\s]+:latest\b/u.test(compose))
  failures.push("latest image tag");
for (const service of ["postgres", "redis"]) {
  const start = compose.indexOf(`  ${service}:`);
  const remaining = start < 0 ? "" : compose.slice(start + 3);
  const nextService = remaining.search(/\n {2}[a-z][a-z0-9_-]*:\n/u);
  const section =
    nextService < 0
      ? compose.slice(Math.max(start, 0))
      : compose.slice(start, start + 3 + nextService);
  if (start < 0 || !section.includes("healthcheck:")) {
    failures.push(`${service} health check`);
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `Compose hardening check failed: ${failures.join(", ")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write("Compose hardening check passed.\n");
}
