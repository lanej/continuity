import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { root, runtime, stop } from "./runtime.ts";
const stages: {
  name: string;
  exitCode: number;
  log: string;
}[] = [];
async function run(name: string, args: string[]) {
  const child = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [out, err, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const log = `stage-${name}.log`;
  await writeFile(resolve(root, "evidence", log), out + err);
  stages.push({ name, exitCode, log });
  process.stdout.write(out);
  process.stderr.write(err);
  if (exitCode !== 0) throw new Error(`Failed: ${args.join(" ")}`);
}
const manifestPath = resolve(runtime, "server.json");
if (await Bun.file(manifestPath).exists())
  throw new Error("Another proof server has ownership metadata; stop/inspect it first");
const server = Bun.spawn([process.execPath, "scripts/runtime.ts", "start"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
let ownsServer = false;
let failure: string | null = null;
try {
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error("Proof server failed to start");
    if (await Bun.file(manifestPath).exists()) {
      ownsServer = true;
      break;
    }
    await Bun.sleep(100);
  }
  if (!ownsServer) throw new Error("Proof server ownership timeout");
  // Startup readiness is checked by the launcher; allow that bounded probe to finish.
  const { Store } = await import("../src/store.ts");
  let ready = false;
  for (let n = 0; n < 50; n++) {
    try {
      const db = await Store.connect();
      try {
        await db.sql`SELECT 1`;
        ready = true;
      } finally {
        await db.close();
      }
    } catch {
      await Bun.sleep(100);
    }
    if (ready) break;
  }
  if (!ready) throw new Error("Proof SQL readiness timeout");
  await run("storage", [process.execPath, "scripts/storage-probe.ts"]);
  await run("domain", [process.execPath, "test"]);
  await run("typecheck", [process.execPath, "run", "typecheck"]);
  await run("lifecycle", [process.execPath, "scenarios/acceptance.ts"]);
} catch (error) {
  failure = String(error);
  process.exitCode = 1;
  console.error(failure);
} finally {
  if (ownsServer) {
    try {
      await stop();
    } catch (error) {
      failure = `${failure ?? ""}\nCleanup: ${String(error)}`;
      process.exitCode = 1;
    }
  }
  if (server.exitCode === null && !ownsServer) {
    server.kill("SIGTERM");
  }
  if (ownsServer && server.exitCode === null && failure?.includes("Cleanup:")) {
    // Preserve ownership evidence; do not use a timeout to kill an unconfirmed child.
    console.error("Server retained: inspect the saved manifest and task-owned log");
    server.unref();
  } else await server.exited;
  await writeFile(
    resolve(root, "evidence/run-status.json"),
    JSON.stringify(
      {
        passed: failure === null,
        failure,
        stages,
        ownsServer,
        stopped: !(await Bun.file(manifestPath).exists()),
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await writeFile(
    resolve(root, "evidence/run-assessment.md"),
    failure
      ? `# Latest run assessment\n\nStatus: failed or incomplete.\n\n${failure}\n\nInspect run-status.json, stage logs and retained task-owned runtime logs. Unrun stages establish nothing. Reproduce with \`bun run acceptance\` after inspecting any retained server ownership metadata. This failure supersedes earlier passing evidence for the latest run.\n`
      : `# Latest run assessment\n\nStatus: passed.\n\nAll four stages exited successfully: real-Dolt storage gate, domain regression tests, strict TypeScript checking, and controlled full-lifecycle acceptance. Server shutdown completed: ${!(await Bun.file(manifestPath).exists())}. See run-status.json, acceptance.json and their stage logs for exact evidence.\n\nThe model and tested Dolt path support proceeding to a separately scoped integration slice. Live integration, production readiness and migration remain unproven. See ../assessment.md for the domain/storage comparison and recommendation.\n`,
  );
}
