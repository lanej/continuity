import { main } from "./cli.ts";
// This entry point represents the explicit operator in the controlled harness.
// It is not production authentication or a security boundary against shell access.
if (import.meta.main)
    await main("operator");
