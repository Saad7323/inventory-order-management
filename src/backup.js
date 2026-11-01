const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("./database");
const { audit } = require("./audit");
const TABLES = [
  "users",
  "customers",
  "suppliers",
  "products",
  "orders",
  "purchase_orders",
  "order_items",
  "purchase_order_items",
  "product_suppliers",
  "stock_movements",
  "audit_logs",
];
const checksum = (tables) =>
  crypto.createHash("sha256").update(JSON.stringify(tables)).digest("hex");
function exportBackup(db) {
  return db.transaction(() => {
    const tables = Object.fromEntries(
      TABLES.map((table) => [
        table,
        db.prepare(`SELECT * FROM ${table}`).all(),
      ]),
    );
    return JSON.stringify(
      {
        format: "stockpilot-backup",
        version: 2,
        createdAt: new Date().toISOString(),
        checksum: checksum(tables),
        tables,
      },
      null,
      2,
    );
  })();
}
function importTables(db, tables) {
  db.pragma("defer_foreign_keys = ON");
  db.prepare("DELETE FROM sessions").run();
  for (const table of [...TABLES].reverse())
    db.prepare(`DELETE FROM ${table}`).run();
  for (const table of TABLES) {
    const columns = db.pragma(`table_info(${table})`);
    const names = columns.map((column) => column.name);
    const insert = db.prepare(
      `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
    );
    for (const row of tables[table]) {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).length !== names.length ||
        names.some((name) => !Object.hasOwn(row, name))
      )
        throw new Error(`Invalid columns in ${table}.`);
      for (const col of columns) {
        const value = row[col.name];
        if (value === null && !col.notnull && !col.pk) continue;
        if (
          col.type === "INTEGER" &&
          (!Number.isSafeInteger(value) ||
            Math.abs(value) > Number.MAX_SAFE_INTEGER)
        )
          throw new Error(`Invalid number in ${table}.${col.name}.`);
        if (
          col.type === "REAL" &&
          (typeof value !== "number" || !Number.isFinite(value))
        )
          throw new Error(`Invalid amount in ${table}.${col.name}.`);
        if (
          col.type === "TEXT" &&
          (typeof value !== "string" || value.length > 20000)
        )
          throw new Error(`Invalid text in ${table}.${col.name}.`);
        if (col.name === "id" && value < 1)
          throw new Error("Record IDs must be positive.");
      }
      insert.run(...names.map((name) => row[name]));
    }
  }
  if (db.pragma("foreign_key_check").length)
    throw new Error("Backup contains broken record references.");
  if (
    !db.prepare("SELECT id FROM users WHERE role='manager' AND active=1").get()
  )
    throw new Error("Backup must contain an active manager.");
  for (const user of db.prepare("SELECT * FROM users").all()) {
    if (
      !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.password_hash) ||
      !user.email ||
      !user.name
    )
      throw new Error("Invalid user account in backup.");
  }
  if (
    db
      .prepare(
        "SELECT id FROM products WHERE active NOT IN (0,1) OR stock_quantity > 100000000 OR stock_quantity != COALESCE((SELECT SUM(change_quantity) FROM stock_movements WHERE product_id=products.id),0)",
      )
      .get()
  )
    throw new Error(
      "Backup inventory does not match its stock movement history.",
    );
  if (
    db
      .prepare(
        "SELECT id FROM orders WHERE status NOT IN ('confirmed','cancelled') OR ABS(total_amount - COALESCE((SELECT SUM(quantity*unit_price) FROM order_items WHERE order_id=orders.id),0)) > 0.011",
      )
      .get()
  )
    throw new Error("Invalid order totals or statuses in backup.");
  if (
    db
      .prepare(
        "SELECT id FROM purchase_orders WHERE ABS(total_amount - COALESCE((SELECT SUM(quantity*unit_cost) FROM purchase_order_items WHERE purchase_order_id=purchase_orders.id),0)) > 0.011",
      )
      .get()
  )
    throw new Error("Invalid purchase order totals in backup.");
}
function restoreBackup(db, raw, actor, { safetyDirectory } = {}) {
  let backup;
  try {
    backup = JSON.parse(raw);
  } catch {
    throw new Error("Choose a valid StockPilot JSON backup.");
  }
  if (
    backup?.format !== "stockpilot-backup" ||
    backup.version !== 2 ||
    !backup.tables ||
    TABLES.some(
      (table) =>
        !Array.isArray(backup.tables[table]) ||
        backup.tables[table].length > 100000,
    ) ||
    Object.keys(backup.tables).length !== TABLES.length
  )
    throw new Error("Unsupported or incomplete backup.");
  if (checksum(backup.tables) !== backup.checksum)
    throw new Error(
      "Backup checksum does not match. The file may have been changed or damaged.",
    );
  const staging = createDatabase(":memory:");
  try {
    staging.transaction(() => importTables(staging, backup.tables)).immediate();
  } catch (error) {
    throw new Error(`Restore rejected: ${error.message}`);
  } finally {
    staging.close();
  }
  if (safetyDirectory) {
    fs.mkdirSync(safetyDirectory, { recursive: true, mode: 0o700 });
    const file = path.join(safetyDirectory, `pre-restore-${Date.now()}.json`);
    fs.writeFileSync(file, exportBackup(db), { mode: 0o600, flag: "wx" });
  }
  db.transaction(() => {
    importTables(db, backup.tables);
    audit(
      db,
      actor,
      "backup.restored",
      "database",
      null,
      `Restored backup from ${backup.createdAt}. All sessions revoked.`,
    );
  }).immediate();
}
module.exports = { exportBackup, restoreBackup, TABLES };
