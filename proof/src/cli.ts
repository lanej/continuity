import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Store } from "./store.ts";
import { DomainError, findKnowledge, renderWork, type Authority } from "./model.ts";
import { root } from "../scripts/runtime.ts";
export async function main(authority: Authority = "agent") {
  const store = await Store.connect();
  try {
    const [operation, argument] = process.argv.slice(2);
    if (operation === "command") {
      const input = JSON.parse(await Bun.stdin.text());
      console.log(JSON.stringify({ ok: true, outcome: await store.execute(input, authority) }));
    } else if (operation === "snapshot") console.log(JSON.stringify(await store.snapshot()));
    else if (operation === "lookup")
      console.log(JSON.stringify(findKnowledge(await store.snapshot(), JSON.parse(argument ?? "{}"))));
    else if (operation === "render" && argument) {
      const view = renderWork(await store.snapshot(), argument);
      const destination = resolve(root, "evidence/views");
      await mkdir(destination, { recursive: true });
      // Caller IDs never become filesystem paths.
      await writeFile(resolve(destination, "specification.md"), view.specification);
      await writeFile(resolve(destination, "decisions.md"), view.decisions);
      console.log(JSON.stringify({ workId: argument, destination }));
    } else throw new Error("Use command (JSON stdin), snapshot, lookup QUERY_JSON, or render WORK_ID");
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        code: error instanceof DomainError ? error.code : "failure",
        message: String(error),
      }),
    );
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}
if (import.meta.main) await main();
