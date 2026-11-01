const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const { createDatabase } = require("../src/database");
const {
  addProduct,
  adjustStock,
  deactivateProduct,
} = require("../src/inventory");
const { confirmOrder, cancelOrder } = require("../src/orders");
const { saveContact } = require("../src/contacts");
const {
  createPurchaseOrder,
  transitionPurchaseOrder,
} = require("../src/purchasing");
const { createUser, hashPassword, verifyPassword } = require("../src/auth");
const { exportBackup, restoreBackup } = require("../src/backup");
const q = require("../src/queries");
function fresh(t) {
  const db = createDatabase(":memory:");
  t.after(() => db.close());
  const id = addProduct(db, {
    sku: "TEST",
    name: "Test product",
    unitPrice: 0.1,
    stockQuantity: 20,
    reorderLevel: 5,
    category: "Office",
  });
  return { db, id };
}
function purchase(t) {
  const { db, id } = fresh(t);
  const supplierId = saveContact(db, "suppliers", {
    name: "Supplier",
    email: "supplier@example.test",
    productIds: [id],
  });
  const orderId = createPurchaseOrder(db, {
    supplierId,
    items: [{ productId: id, quantity: 10, unitCost: 0.07 }],
  });
  return { db, id, orderId, supplierId };
}
test("opening balances and signed adjustments reconcile exactly with on-hand quantities", (t) => {
  const { db, id } = fresh(t);
  adjustStock(db, { productId: id, quantity: 5, reason: "Received delivery" });
  adjustStock(db, { productId: id, quantity: -3, reason: "Damaged goods" });
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products WHERE id=?").get(id)
      .stock_quantity,
    22,
  );
  assert.equal(
    db
      .prepare(
        "SELECT SUM(change_quantity) n FROM stock_movements WHERE product_id=?",
      )
      .get(id).n,
    22,
  );
  const before = db.prepare("SELECT COUNT(*) n FROM stock_movements").get().n;
  assert.throws(
    () => adjustStock(db, { productId: id, quantity: -23, reason: "Invalid" }),
    /invalid quantity/,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM stock_movements").get().n,
    before,
  );
  assert.throws(
    () => adjustStock(db, { productId: id, quantity: 0, reason: "Zero" }),
    /cannot be zero/,
  );
});
test("cancellation handles duplicate lines and discontinued products without double-restoring", (t) => {
  const { db, id } = fresh(t);
  const order = confirmOrder(db, {
    customerName: "Customer",
    items: [
      { productId: id, quantity: 2 },
      { productId: id, quantity: 1 },
    ],
  });
  assert.equal(order.total, 0.3);
  deactivateProduct(db, id);
  cancelOrder(db, order.id);
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products WHERE id=?").get(id)
      .stock_quantity,
    20,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM stock_movements WHERE reason='Order cancelled'",
      )
      .get().n,
    1,
  );
  assert.throws(() => cancelOrder(db, order.id), /Only confirmed/);
});
test("failed cancellation rolls back earlier line restores and the order state", (t) => {
  const { db, id } = fresh(t);
  const second = addProduct(db, {
    sku: "SECOND",
    name: "Second",
    unitPrice: 1,
    stockQuantity: 2,
    reorderLevel: 0,
  });
  const order = confirmOrder(db, {
    customerName: "Customer",
    items: [
      { productId: id, quantity: 2 },
      { productId: second, quantity: 1 },
    ],
  });
  db.prepare("UPDATE products SET stock_quantity=100000000 WHERE id=?").run(
    second,
  );
  assert.throws(() => cancelOrder(db, order.id), /invalid quantity/);
  assert.equal(
    db.prepare("SELECT status FROM orders").get().status,
    "confirmed",
  );
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products WHERE id=?").get(id)
      .stock_quantity,
    18,
  );
});
test("purchase creation reserves no inventory and receiving adds every quantity once", (t) => {
  const { db, id, orderId } = purchase(t);
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products").get().stock_quantity,
    20,
  );
  transitionPurchaseOrder(db, orderId, "received");
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products").get().stock_quantity,
    30,
  );
  assert.equal(
    db.prepare("SELECT total_amount FROM purchase_orders").get().total_amount,
    0.7,
  );
  assert.equal(
    db
      .prepare(
        "SELECT purchase_order_id FROM stock_movements WHERE purchase_order_id IS NOT NULL",
      )
      .get().purchase_order_id,
    orderId,
  );
  assert.throws(
    () => transitionPurchaseOrder(db, orderId, "received"),
    /Only pending/,
  );
  assert.throws(
    () => transitionPurchaseOrder(db, orderId, "cancelled"),
    /Only pending/,
  );
});
test("cancelled purchase orders cannot be received and never change stock", (t) => {
  const { db, orderId } = purchase(t);
  transitionPurchaseOrder(db, orderId, "cancelled");
  assert.throws(
    () => transitionPurchaseOrder(db, orderId, "received"),
    /Only pending/,
  );
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products").get().stock_quantity,
    20,
  );
});
test("invalid supplier associations and repeated purchase lines reject the whole purchase", (t) => {
  const { db, id, supplierId } = purchase(t);
  const second = addProduct(db, {
    sku: "SECOND",
    name: "Other",
    unitPrice: 1,
    stockQuantity: 2,
    reorderLevel: 0,
  });
  assert.throws(
    () =>
      createPurchaseOrder(db, {
        supplierId,
        items: [{ productId: second, quantity: 1, unitCost: 1 }],
      }),
    /associated/,
  );
  assert.throws(
    () =>
      createPurchaseOrder(db, {
        supplierId,
        items: [
          { productId: id, quantity: 1, unitCost: 1 },
          { productId: id, quantity: 1, unitCost: 1 },
        ],
      }),
    /duplicate/,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM purchase_orders").get().n, 1);
});
test("customer edits preserve linked history and historical order names and prices", (t) => {
  const { db, id } = fresh(t);
  const customerId = saveContact(db, "customers", {
    name: "Original",
    email: "original@example.test",
  });
  const order = confirmOrder(db, {
    customerId,
    items: [{ productId: id, quantity: 3 }],
  });
  saveContact(
    db,
    "customers",
    { name: "Updated", email: "updated@example.test" },
    null,
    customerId,
  );
  db.prepare("UPDATE products SET unit_price=9 WHERE id=?").run(id);
  const stored = db.prepare("SELECT * FROM orders WHERE id=?").get(order.id);
  assert.equal(stored.customer_id, customerId);
  assert.equal(stored.customer_name, "Original");
  assert.equal(stored.total_amount, 0.3);
});
test("report date boundaries are inclusive; cancelled orders are excluded from net sales", (t) => {
  const { db, id } = fresh(t);
  for (const stamp of [
    "2026-01-01 00:00:00",
    "2026-01-01 23:59:59",
    "2026-01-02 00:00:00",
  ]) {
    const order = confirmOrder(db, {
      customerName: "Customer",
      items: [{ productId: id, quantity: 1 }],
    });
    db.prepare("UPDATE orders SET created_at=? WHERE id=?").run(
      stamp,
      order.id,
    );
    db.prepare(
      "UPDATE stock_movements SET created_at=? WHERE order_id=? AND reason='Order confirmed'",
    ).run(stamp, order.id);
  }
  const result = q.report(db, { from: "2026-01-01", to: "2026-01-01" });
  assert.equal(result.stats.orders, 2);
  assert.equal(result.stats.revenue, 0.2);
  assert.equal(result.daily.length, 1);
  cancelOrder(db, 1);
  assert.equal(
    q.report(db, { from: "2026-01-01", to: "2026-01-01" }).stats.revenue,
    0.1,
  );
  assert.throws(() => q.report(db, { from: "2026-02-30" }), /valid date/);
  assert.throws(
    () => q.report(db, { from: "2026-02-01", to: "2026-01-01" }),
    /Start date/,
  );
});
test("inventory reports reconstruct opening and closing stock including zero-stock products", (t) => {
  const { db, id } = fresh(t);
  db.prepare(
    "UPDATE stock_movements SET created_at='2026-01-01 12:00:00'",
  ).run();
  adjustStock(db, { productId: id, quantity: 5, reason: "In" });
  db.prepare(
    "UPDATE stock_movements SET created_at='2026-01-02 00:00:00' WHERE reason='In'",
  ).run();
  adjustStock(db, { productId: id, quantity: -7, reason: "Out" });
  db.prepare(
    "UPDATE stock_movements SET created_at='2026-01-02 23:59:59' WHERE reason='Out'",
  ).run();
  adjustStock(db, { productId: id, quantity: 4, reason: "Later" });
  db.prepare(
    "UPDATE stock_movements SET created_at='2026-01-03 00:00:00' WHERE reason='Later'",
  ).run();
  const row = q.report(db, { from: "2026-01-02", to: "2026-01-02" })
    .inventory[0];
  assert.equal(row.opening, 20);
  assert.equal(row.closing, 18);
  assert.equal(row.increases, 5);
  assert.equal(row.decreases, 7);
});
test("CSV escapes delimiters, multiline text, quotes and spreadsheet formulas", () => {
  const csv = q.csv(
    [
      { name: '=HYPERLINK("https://example.com")', quantity: -2 },
      { name: 'a,"quoted"\nline', quantity: 3 },
      { name: "  +formula", quantity: 1 },
    ],
    [
      ["Name", "name"],
      ["Qty", "quantity"],
    ],
  );
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"-2"/);
  assert.match(csv, /"a,""quoted""\nline"/);
  assert.match(csv, /'  \+formula/);
});
test("backup roundtrip retains associations, users, orders, purchases and audit entries", (t) => {
  const { db, id, orderId } = purchase(t);
  createUser(db, {
    name: "Manager",
    email: "manager@example.test",
    password: "backup-password-123",
    role: "manager",
  });
  const actor = db.prepare("SELECT * FROM users").get();
  transitionPurchaseOrder(db, orderId, "received", actor);
  const sale = confirmOrder(
    db,
    { customerName: "Customer", items: [{ productId: id, quantity: 2 }] },
    actor,
  );
  cancelOrder(db, sale.id, actor);
  const backup = exportBackup(db);
  adjustStock(db, { productId: id, quantity: 3, reason: "Later" }, actor);
  restoreBackup(db, backup, actor);
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products").get().stock_quantity,
    30,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM product_suppliers").get().n,
    1,
  );
  assert.equal(
    db.prepare("SELECT status FROM orders").get().status,
    "cancelled",
  );
  assert.equal(
    db.prepare("SELECT status FROM purchase_orders").get().status,
    "received",
  );
  assert.ok(
    db
      .prepare("SELECT id FROM audit_logs WHERE action='backup.restored'")
      .get(),
  );
});
test("restore validates checksum, schema, foreign keys, ledger and manager presence before mutation", (t) => {
  const { db } = fresh(t);
  createUser(db, {
    name: "Manager",
    email: "manager@example.test",
    password: "backup-password-123",
    role: "manager",
  });
  const original = exportBackup(db);
  const corrupt = JSON.parse(original);
  corrupt.tables.products[0].stock_quantity = 999;
  assert.throws(() => restoreBackup(db, JSON.stringify(corrupt)), /checksum/);
  const mutations = [
    (b) => (b.tables.products[0].stock_quantity = 999),
    (b) => (b.tables.stock_movements[0].product_id = 999),
    (b) => (b.tables.users = []),
    (b) => (b.tables.products[0].unknown = "bad"),
    (b) => (b.tables.products[0].stock_quantity = -1),
  ];
  for (const mutate of mutations) {
    const b = JSON.parse(original);
    mutate(b);
    b.checksum = crypto
      .createHash("sha256")
      .update(JSON.stringify(b.tables))
      .digest("hex");
    assert.throws(
      () => restoreBackup(db, JSON.stringify(b)),
      /Restore rejected/,
    );
    assert.equal(
      exportBackup(db).split('"tables":')[1],
      original.split('"tables":')[1],
    );
  }
});
test("legacy migration is non-destructive and idempotent", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stockpilot-migrate-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "legacy.db");
  const legacy = new Database(filename);
  legacy.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY, sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL, unit_price REAL NOT NULL, stock_quantity INTEGER NOT NULL, reorder_level INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO products(sku,name,unit_price,stock_quantity) VALUES ('OLD','Legacy product',10,7);`);
  legacy.close();
  for (let i = 0; i < 2; i++) {
    const db = createDatabase(filename);
    assert.equal(
      db.prepare("SELECT stock_quantity FROM products").get().stock_quantity,
      7,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM stock_movements").get().n,
      1,
    );
    assert.equal(
      db.prepare("SELECT category FROM products").get().category,
      "General",
    );
    db.close();
  }
});
test("password hashing uses unique salts and rejects incorrect or oversized passwords", () => {
  const first = hashPassword("long-password-123");
  const second = hashPassword("long-password-123");
  assert.notEqual(first, second);
  assert.equal(verifyPassword("long-password-123", first), true);
  assert.equal(verifyPassword("incorrect", first), false);
  assert.equal(verifyPassword("a".repeat(129), first), false);
  assert.throws(() => hashPassword("short"), /10 and 128/);
});
test("rejected product and contact writes leave no partial record or audit event", (t) => {
  const { db } = fresh(t);
  const before = db.prepare("SELECT COUNT(*) n FROM audit_logs").get().n;
  assert.throws(
    () =>
      addProduct(db, {
        sku: "INVALID",
        name: "Bad",
        unitPrice: 1,
        stockQuantity: 1,
        reorderLevel: 0,
        supplierIds: [999],
      }),
    /Supplier not found/,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM products WHERE sku='INVALID'").get().n,
    0,
  );
  assert.throws(
    () =>
      saveContact(db, "suppliers", { name: "Bad supplier", productIds: [999] }),
    /Product not found/,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM suppliers").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_logs").get().n, before);
});

test("sales trends retain zero-sale days and aggregate long ranges without changing revenue", () => {
  const daily = [{ day: "2026-01-03", revenue: 12.5, orders: 1 }];
  const trend = q.salesTrend(daily, "2026-01-01", "2026-01-04");
  assert.deepEqual(
    trend.points.map((p) => p.revenue),
    [0, 0, 12.5, 0],
  );
  const long = q.salesTrend(daily, "2026-01-01", "2026-12-31");
  assert.ok(long.points.length <= 120);
  assert.equal(
    long.points.reduce((sum, p) => sum + p.revenue, 0),
    12.5,
  );
});
