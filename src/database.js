const Database = require("better-sqlite3");
const path = require("node:path");
const fs = require("node:fs");
const DEFAULT_PATH = path.join(__dirname, "..", "data", "inventory.db");

function createDatabase(filename = DEFAULT_PATH) {
  if (filename !== ":memory:")
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") db.pragma("journal_mode = WAL");
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('manager','staff')),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '', contact_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        unit_price REAL NOT NULL CHECK(unit_price >= 0), stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
        reorder_level INTEGER NOT NULL DEFAULT 0 CHECK(reorder_level >= 0), active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY, customer_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
        total_amount REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price REAL NOT NULL CHECK(unit_price >= 0)
      );
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','received','cancelled')),
        total_amount REAL NOT NULL CHECK(total_amount >= 0), notes TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id), expected_at TEXT, received_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INTEGER PRIMARY KEY, purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_cost REAL NOT NULL CHECK(unit_cost >= 0)
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), order_id INTEGER REFERENCES orders(id),
        change_quantity INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS product_suppliers (
        product_id INTEGER NOT NULL REFERENCES products(id), supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
        PRIMARY KEY(product_id, supplier_id)
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY, actor_id INTEGER, actor_name TEXT NOT NULL DEFAULT 'System',
        action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER, details TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const addColumn = (table, name, definition) => {
      if (
        !db
          .pragma(`table_info(${table})`)
          .some((column) => column.name === name)
      )
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    };
    addColumn("products", "category", "TEXT NOT NULL DEFAULT 'General'");
    addColumn("products", "updated_at", "TEXT");
    addColumn("orders", "customer_id", "INTEGER REFERENCES customers(id)");
    addColumn("orders", "created_by", "INTEGER REFERENCES users(id)");
    addColumn("orders", "cancelled_at", "TEXT");
    addColumn(
      "stock_movements",
      "purchase_order_id",
      "INTEGER REFERENCES purchase_orders(id)",
    );
    addColumn("stock_movements", "created_by", "INTEGER REFERENCES users(id)");
    addColumn("stock_movements", "balance_after", "INTEGER");
    // Preserve earlier databases, backfilling opening balances and customer links.
    for (const product of db.prepare("SELECT * FROM products").all()) {
      const sum = db
        .prepare(
          "SELECT COALESCE(SUM(change_quantity),0) AS quantity FROM stock_movements WHERE product_id = ?",
        )
        .get(product.id).quantity;
      const opening = product.stock_quantity - sum;
      if (opening)
        db.prepare(
          "INSERT INTO stock_movements (product_id, change_quantity, reason, created_at) VALUES (?, ?, 'Opening balance', ?)",
        ).run(product.id, opening, product.created_at);
    }
    for (const order of db
      .prepare("SELECT * FROM orders WHERE customer_id IS NULL")
      .all()) {
      let customer = db
        .prepare("SELECT id FROM customers WHERE name = ? COLLATE NOCASE")
        .get(order.customer_name);
      if (!customer)
        customer = {
          id: db
            .prepare("INSERT INTO customers (name) VALUES (?)")
            .run(order.customer_name).lastInsertRowid,
        };
      db.prepare("UPDATE orders SET customer_id = ? WHERE id = ?").run(
        customer.id,
        order.id,
      );
    }
    db.exec(`
      UPDATE products SET updated_at = created_at WHERE updated_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at, id);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_movements_product_date ON stock_movements(product_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(created_at, id);
      CREATE INDEX IF NOT EXISTS idx_products_status ON products(active, category, stock_quantity);
      CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at, id);
      PRAGMA user_version = 2;
    `);
  })();
  return db;
}
function seedProducts(db) {
  if (db.prepare("SELECT COUNT(*) AS count FROM products").get().count) return;
  db.transaction(() => {
    const insert = db.prepare(
      "INSERT INTO products (sku, name, unit_price, stock_quantity, reorder_level, category, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
    );
    const products = [
      ["KB-100", "Wireless Keyboard", 49.99, 15, 5, "Electronics"],
      ["MS-200", "Optical Mouse", 24.99, 8, 5, "Electronics"],
      ["HD-300", "USB-C Hub", 39.99, 3, 4, "Accessories"],
      ["MN-400", "27-inch Monitor", 249, 12, 4, "Electronics"],
      ["CH-500", "Ergonomic Chair", 189, 18, 5, "Furniture"],
      ["HP-600", "Studio Headphones", 89, 22, 6, "Electronics"],
      ["DS-700", "Standing Desk", 349, 6, 2, "Furniture"],
      ["CB-800", "Braided USB-C Cable", 14.5, 4, 10, "Accessories"],
      ["LP-900", "Desk Lamp", 34, 16, 4, "Office"],
      ["WB-010", "Notebook Set", 12, 36, 10, "Office"],
      ["WC-020", "Wireless Charger", 29, 0, 5, "Accessories"],
      ["LS-030", "Laptop Stand", 45, 9, 3, "Accessories"],
    ];
    for (const row of products) {
      const id = insert.run(...row).lastInsertRowid;
      if (row[3])
        db.prepare(
          "INSERT INTO stock_movements (product_id, change_quantity, reason, balance_after) VALUES (?, ?, 'Opening balance', ?)",
        ).run(id, row[3], row[3]);
    }
    const supplier = db
      .prepare(
        "INSERT INTO suppliers (name, contact_name, email, phone, address) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "Northstar Supply Co.",
        "Alex Morgan",
        "orders@example.com",
        "+1 555 0100",
        "42 Market Street",
      ).lastInsertRowid;
    db.prepare(
      "INSERT INTO product_suppliers (product_id, supplier_id) SELECT id, ? FROM products",
    ).run(supplier);
  })();
}
module.exports = { createDatabase, seedProducts, DEFAULT_PATH };
