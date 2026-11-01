const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDatabase } = require("../src/database");
const { createApp } = require("../src/server");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "stockpilot-e2e-"));
const db = createDatabase(path.join(directory, "inventory.db"));
const server = createApp(db).listen(3101, "127.0.0.1", () =>
  console.log("Test server ready on 3101"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
      process.exit(0);
    }),
  );
