// Test helper only: starts a throwaway local Postgres 16 in a temp directory, applies the migrations, and
// returns its URL. Needs the Postgres binaries on disk (brew install postgresql@16). Never used in production.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PG_BIN = process.env.PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
const DB_DIR = fileURLToPath(new URL("..", import.meta.url));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

export async function startTestPostgres(): Promise<{ url: string; stop: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "ezk-pg-"));
  const port = await freePort();
  execFileSync(join(PG_BIN, "initdb"), ["-D", dir, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { stdio: "ignore" });
  // Unix sockets are disabled: temp paths can exceed the socket path limit, and TCP on localhost is enough.
  execFileSync(join(PG_BIN, "pg_ctl"), ["-D", dir, "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c fsync=off`, "-l", join(dir, "log"), "-w", "start"], { stdio: "ignore" });
  execFileSync(join(PG_BIN, "psql"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-c", "create database eziokwu_test"], { stdio: "ignore" });
  const url = `postgresql://postgres@127.0.0.1:${port}/eziokwu_test`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: DB_DIR, env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
  return {
    url,
    stop: () => {
      try {
        execFileSync(join(PG_BIN, "pg_ctl"), ["-D", dir, "-m", "immediate", "stop"], { stdio: "ignore" });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
