import { spawnSync } from "node:child_process";

function runWrangler(args, env) {
  return spawnSync("npx", ["wrangler", ...args], {
    env,
    shell: true,
    stdio: "inherit",
  });
}

const env = { ...process.env };
if (env.CLOUDFLARE_API_TOKEN) {
  const check = spawnSync("npx", ["wrangler", "whoami"], {
    env,
    shell: true,
    encoding: "utf8",
  });
  if (check.status !== 0) {
    delete env.CLOUDFLARE_API_TOKEN;
  }
}

const result = runWrangler(
  [
    "pages",
    "deploy",
    "apps/web/dist",
    "--project-name=remedy-growth",
    "--branch=main",
    "--commit-dirty=true",
  ],
  env,
);
process.exit(result.status ?? 1);
