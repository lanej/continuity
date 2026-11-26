import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, open } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
export const root = resolve(import.meta.dir, "..");
export const runtime = resolve(root, ".runtime");
export const tools = resolve(root, ".tools");
export const binary = resolve(tools, "dolt-darwin-arm64/bin/dolt");
const checksum = "229a99be0c0413a0fbed8c9bf65d7624578fbaafe8a653614a6ba8d0535a3726";
const source = "https://github.com/dolthub/dolt/releases/download/v2.7.6/dolt-darwin-arm64.tar.gz";
const manifestPath = resolve(runtime, "server.json");
type Manifest = {
  pid: number;
  token: string;
  port: number;
  database: string;
  data: string;
};
async function run(args: string[], cwd = root) {
  const p = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code) throw new Error(`${args[0]} failed (${code}): ${err}`);
  return out.trim();
}
export async function setup() {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("This pinned proof targets Darwin arm64");
  if (Bun.version !== "1.4.5") throw new Error("Use Bun 1.4.5");
  await mkdir(tools, { recursive: true });
  await mkdir(runtime, { recursive: true });
  const archive = resolve(tools, "dolt-darwin-arm64.tar.gz");
  const verificationPath = resolve(tools, "verified.json");
  const provenance = (await Bun.file(verificationPath).exists())
    ? (JSON.parse(await readFile(verificationPath, "utf8")) as {
        checksum: string;
        binarySha256?: string;
      })
    : null;
  if (!(await Bun.file(binary).exists()) || !provenance?.binarySha256) {
    if (!(await Bun.file(archive).exists())) {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Dolt download: ${response.status}`);
      await Bun.write(archive, response);
    }
    const actual = createHash("sha256")
      .update(await readFile(archive))
      .digest("hex");
    if (actual !== checksum) throw new Error("Dolt release checksum mismatch");
    await run(["tar", "-xzf", archive, "-C", tools]);
    await writeFile(
      verificationPath,
      JSON.stringify(
        {
          source,
          checksum,
          actual,
          binarySha256: createHash("sha256")
            .update(await readFile(binary))
            .digest("hex"),
        },
        null,
        2,
      ),
    );
  }
  const verified = JSON.parse(await readFile(verificationPath, "utf8")) as {
    checksum: string;
    binarySha256: string;
  };
  if (verified.checksum !== checksum) throw new Error("Missing verified provenance");
  if (
    verified.binarySha256 !==
    createHash("sha256")
      .update(await readFile(binary))
      .digest("hex")
  )
    throw new Error("Extracted Dolt binary changed since checksum verification");
  const version = await run([binary, "version"]);
  if (!version.includes("2.7.6")) throw new Error(`Unexpected Dolt version: ${version}`);
  await mkdir(resolve(root, "evidence"), { recursive: true });
  await writeFile(
    resolve(root, "evidence/runtime.json"),
    JSON.stringify(
      {
        bun: Bun.version,
        dolt: version,
        platform: `${process.platform}-${process.arch}`,
        source,
        sha256: checksum,
        verification: "GitHub release asset digest",
        binarySha256: createHash("sha256")
          .update(await readFile(binary))
          .digest("hex"),
      },
      null,
      2,
    ),
  );
}
export async function manifest(): Promise<Manifest> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
}
export async function start() {
  await setup();
  if (await Bun.file(manifestPath).exists())
    throw new Error("Server manifest exists; inspect/stop this proof's server first");
  const port = await new Promise<number>((accept, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      if (!a || typeof a === "string") return reject(new Error("No port"));
      s.close(() => accept(a.port));
    });
  });
  const token = crypto.randomUUID();
  const data = resolve(runtime, `data-${token}`);
  await mkdir(data);
  const config = resolve(runtime, `server-${token}.yaml`);
  await writeFile(
    config,
    `log_level: warning\nbehavior:\n  dolt_transaction_commit: true\n  event_scheduler: "OFF"\nlistener:\n  host: 127.0.0.1\n  port: ${port}\n  socket: "${resolve("/tmp", `wp-${token}.sock`)}"\ndata_dir: "${data}"\ncfg_dir: "${data}/.doltcfg"\nprivilege_file: "${data}/.doltcfg/privileges.db"\nbranch_control_file: "${data}/.doltcfg/branch_control.db"\n`,
  );
  const log = await open(resolve(runtime, `server-${token}.log`), "a");
  const p = Bun.spawn([binary, "sql-server", "--config", config], {
    cwd: data,
    stdout: log.fd,
    stderr: log.fd,
    stdin: "ignore",
    env: { ...process.env, DOLT_ROOT_PATH: data },
  });
  const entry: Manifest = { pid: p.pid, token, port, database: "work_proof", data };
  await writeFile(manifestPath, JSON.stringify(entry, null, 2));
  await log.close();
  const sql = new Bun.SQL(`mysql://root@127.0.0.1:${port}`, { max: 1, connectionTimeout: 1 });
  try {
    let ready = false;
    for (let n = 0; n < 50; n++) {
      if (p.exitCode !== null) throw new Error("Dolt exited; inspect its task-owned log");
      try {
        await sql`SELECT 1`;
        ready = true;
        break;
      } catch {
        await Bun.sleep(100);
      }
    }
    if (!ready) throw new Error("Dolt startup timeout");
    await sql.unsafe("CREATE DATABASE work_proof");
    console.log(JSON.stringify(entry));
    await p.exited;
    if (await Bun.file(manifestPath).exists())
      await unlink(manifestPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
  } catch (error) {
    p.kill("SIGTERM");
    await p.exited;
    await unlink(manifestPath);
    throw error;
  } finally {
    await sql.close();
  }
}
export async function stop() {
  if (!(await Bun.file(manifestPath).exists())) return;
  const entry = await manifest();
  // Verify the exact saved task-owned config before signaling a reused PID.
  const args = await run(["ps", "-p", String(entry.pid), "-o", "command="]);
  if (!args.includes(binary) || !args.includes(`server-${entry.token}.yaml`))
    throw new Error("Server ownership cannot be confirmed; retained");
  process.kill(entry.pid, "SIGTERM");
  for (let n = 0; n < 50; n++) {
    try {
      process.kill(entry.pid, 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") {
        await unlink(manifestPath).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
        return;
      }
      throw e;
    }
    await Bun.sleep(100);
  }
  throw new Error("Task-owned server did not exit; retained manifest");
}
if (import.meta.main) {
  const operation = process.argv[2];
  try {
    if (operation === "setup") await setup();
    else if (operation === "start") await start();
    else if (operation === "stop") await stop();
    else throw new Error("Use setup, start, or stop");
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
}
