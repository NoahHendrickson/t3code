// Fork columns on upstream tables. Not migrations: the migrator skips every id up to the highest
// recorded, so a fork-numbered one would make a later upstream migration with that id never run.
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export const ensureForkSchema = Effect.fn("ensureForkSchema")(function* () {
  const sql = yield* SqlClient.SqlClient;
  // fork-automation-runs-in-sidebar. BEGIN IMMEDIATE makes a concurrent opener re-check after commit.
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(scheduled_tasks)`;
      if (columns.some((column) => column.name === "fork_show_in_sidebar")) return;
      yield* sql`
        ALTER TABLE scheduled_tasks
        ADD COLUMN fork_show_in_sidebar INTEGER NOT NULL DEFAULT 0
      `;
    }),
  );
});
