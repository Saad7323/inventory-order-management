const test = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer } = require("./helpers");

test("first run requires setup; setup cannot be repeated and passwords are hashed", async (t) => {
  const { db, client } = await startTestServer(t);
  const user = client();
  assert.equal((await user.request("/")).location, "/setup");
  await user.setup();
  assert.match(
    db.prepare("SELECT password_hash FROM users").get().password_hash,
    /^scrypt:/,
  );
  assert.equal(
    (
      await user.post("/setup", {
        name: "Other",
        email: "other@example.test",
        password: "test-password-123",
      })
    ).status,
    403,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, 1);
});

test("web order flow confirms an order and updates the rendered inventory", async (t) => {
  const { db, client } = await startTestServer(t);
  const user = await client().setup();
  const product = db
    .prepare("SELECT id,stock_quantity FROM products WHERE sku='KB-100'")
    .get();
  const result = await user.post("/orders", {
    customerName: "Jordan Lee",
    productId: product.id,
    quantity: 2,
  });
  assert.equal(result.status, 302);
  assert.match(result.location, /^\/orders\/\d+$/);
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products WHERE id=?").get(product.id)
      .stock_quantity,
    product.stock_quantity - 2,
  );
  assert.match((await user.request("/?q=Wireless")).body, /Wireless Keyboard/);
});

test("insufficient stock returns a clear error with no partial order or customer", async (t) => {
  const { db, client } = await startTestServer(t);
  const user = await client().setup();
  const p = db.prepare("SELECT * FROM products WHERE sku='HD-300'").get();
  const result = await user.post("/orders", {
    customerName: "Rejected Customer",
    productId: p.id,
    quantity: 99,
  });
  assert.equal(result.status, 400);
  assert.match(result.body, /Insufficient stock for USB-C Hub/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM orders").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM customers").get().n, 0);
});

test("manager screens and all form pages render, including populated detail views", async (t) => {
  const { db, client } = await startTestServer(t);
  const user = await client().setup();
  await user.post("/orders", {
    customerName: "Customer",
    productId: 1,
    quantity: 1,
  });
  await user.post("/purchases", {
    supplierId: 1,
    productId: 1,
    quantity: 4,
    unitCost: 10,
    notes: "Test",
  });
  for (const url of [
    "/",
    "/?page=2",
    "/?status=low-stock",
    "/dashboard",
    "/products/new",
    "/products/1/edit",
    "/orders",
    "/orders/new",
    "/orders/1",
    "/movements",
    "/customers",
    "/customers/new",
    "/customers/1",
    "/customers/1/edit",
    "/suppliers",
    "/suppliers/new",
    "/suppliers/1",
    "/suppliers/1/edit",
    "/purchases",
    "/purchases/new",
    "/purchases/1",
    "/reports",
    "/audit",
    "/settings",
    "/backup",
    "/search?q=Customer",
  ]) {
    const result = await user.request(url);
    assert.equal(result.status, 200, `${url}: ${result.body.slice(-600)}`);
    assert.doesNotMatch(result.body, /Something went wrong/);
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM purchase_orders").get().n, 1);
});

test("staff permissions are enforced on the server, with working sales and customer flows", async (t) => {
  const { db, client } = await startTestServer(t);
  const manager = await client().setup();
  await manager.post("/settings/users", {
    name: "Staff User",
    email: "staff@example.test",
    password: "staff-password-123",
    role: "staff",
  });
  const staff = await client().login(
    "staff@example.test",
    "staff-password-123",
  );
  for (const path of [
    "/dashboard",
    "/products/new",
    "/products/1/edit",
    "/suppliers",
    "/suppliers/1",
    "/purchases",
    "/reports",
    "/audit",
    "/backup",
    "/backup/download",
    "/export/report",
  ])
    assert.equal((await staff.request(path)).status, 403, path);
  for (const path of [
    "/products",
    "/products/1/restock",
    "/products/1/adjust",
    "/products/1/deactivate",
    "/orders/1/cancel",
    "/purchases",
    "/purchases/1/receive",
    "/suppliers",
    "/settings/users",
    "/backup/restore",
  ])
    assert.equal((await staff.post(path, {})).status, 403, path);
  assert.equal(
    (
      await staff.post("/customers", {
        name: "Staff Contact",
        email: "contact@example.test",
      })
    ).status,
    302,
  );
  assert.equal(
    (await staff.post("/orders", { customerId: 1, productId: 1, quantity: 1 }))
      .status,
    302,
  );
  assert.equal(
    db.prepare("SELECT customer_id FROM orders").get().customer_id,
    1,
  );
  for (const path of [
    "/",
    "/orders",
    "/customers",
    "/movements",
    "/settings",
    "/export/inventory",
    "/export/orders",
  ])
    assert.equal((await staff.request(path)).status, 200, path);
});

test("CSRF is enforced, logout revokes access, and untrusted form IDs cannot redirect mutations", async (t) => {
  const { db, client } = await startTestServer(t);
  const user = await client().setup();
  assert.equal(
    (
      await user.post(
        "/products/1/adjust",
        { quantity: 2, reason: "Bad token" },
        { omitCsrf: true },
      )
    ).status,
    403,
  );
  await user.post("/products/1", {
    productId: 2,
    name: "Changed product",
    sku: "KB-100",
    unitPrice: 10,
    reorderLevel: 1,
    category: "Office",
  });
  assert.equal(
    db.prepare("SELECT name FROM products WHERE id=1").get().name,
    "Changed product",
  );
  assert.equal(
    db.prepare("SELECT name FROM products WHERE id=2").get().name,
    "Optical Mouse",
  );
  await user.post("/logout", {});
  assert.equal((await user.request("/orders")).location, "/login");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);
});

test("cancellation restores stock once through HTTP and excludes cancelled sales", async (t) => {
  const { db, client } = await startTestServer(t);
  const user = await client().setup();
  const before = db
    .prepare("SELECT stock_quantity FROM products WHERE id=1")
    .get().stock_quantity;
  await user.post("/orders", {
    customerName: "Customer",
    productId: [1, 2],
    quantity: [2, 1],
  });
  assert.equal((await user.post("/orders/1/cancel", {})).status, 302);
  assert.equal((await user.post("/orders/1/cancel", {})).status, 400);
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products WHERE id=1").get()
      .stock_quantity,
    before,
  );
  assert.match((await user.request("/orders/1")).body, /Cancelled/);
});

test("inventory filters combine criteria and CSV exports all matches beyond the current page", async (t) => {
  const { db, client } = await startTestServer(t);
  const user = await client().setup();
  const result = await user.request(
    "/?category=Accessories&status=low-stock&maxPrice=20",
  );
  assert.equal(result.status, 200);
  const rows = result.body.split("<tbody>")[1].split("</tbody>")[0];
  assert.match(rows, /Braided USB-C Cable/);
  assert.doesNotMatch(rows, /USB-C Hub/);
  const csv = await user.request("/export/inventory?page=2&limit=10");
  assert.match(
    csv.response.headers.get("content-disposition"),
    /inventory.csv/,
  );
  assert.equal(csv.body.trim().split("\r\n").length, 13);
  assert.equal((await user.request("/?page=9999")).status, 200);
});

test("backup download and restore revoke sessions and restore data; failed restore leaves data intact", async (t) => {
  const { db, client } = await startTestServer(t);
  const user = await client().setup();
  const backup = (await user.request("/backup/download")).body;
  const before = db
    .prepare("SELECT stock_quantity FROM products WHERE id=1")
    .get().stock_quantity;
  await user.post("/products/1/adjust", {
    quantity: 8,
    reason: "After backup",
  });
  assert.equal(
    (
      await user.post("/backup/restore", {
        backup: "{}",
        restoreConfirm: "RESTORE",
      })
    ).status,
    400,
  );
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products WHERE id=1").get()
      .stock_quantity,
    before + 8,
  );
  const result = await user.post("/backup/restore", {
    backup,
    restoreConfirm: "RESTORE",
  });
  assert.equal(result.location, "/login");
  assert.equal(
    db.prepare("SELECT stock_quantity FROM products WHERE id=1").get()
      .stock_quantity,
    before,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);
  await user.login();
  assert.equal((await user.request("/")).status, 200);
});

test("disabling an account revokes its session and a manager cannot remove their own access", async (t) => {
  const { db, client } = await startTestServer(t);
  const manager = await client().setup();
  await manager.post("/settings/users", {
    name: "Staff",
    email: "staff@example.test",
    password: "staff-password-123",
    role: "staff",
  });
  const staff = await client().login(
    "staff@example.test",
    "staff-password-123",
  );
  assert.equal(
    (await manager.post("/settings/users/1", { role: "staff", active: 0 }))
      .status,
    400,
  );
  await manager.post("/settings/users/2", { role: "staff", active: 0 });
  assert.equal((await staff.request("/")).location, "/login");
  assert.equal(
    db.prepare("SELECT active FROM users WHERE id=2").get().active,
    0,
  );
});

test("invalid sign-ins are throttled and no user hash is exposed in settings", async (t) => {
  const { client } = await startTestServer(t);
  const manager = await client().setup();
  assert.doesNotMatch((await manager.request("/settings")).body, /scrypt:/);
  const attacker = client();
  await attacker.request("/login");
  for (let i = 0; i < 8; i++)
    assert.equal(
      (
        await attacker.post("/login", {
          email: "manager@example.test",
          password: "incorrect",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await attacker.post("/login", {
        email: "manager@example.test",
        password: "incorrect",
      })
    ).status,
    429,
  );
});
