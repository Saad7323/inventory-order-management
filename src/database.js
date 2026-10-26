const Database = require('better-sqlite3');
const path = require('node:path');

function createDatabase(filename = path.join(__dirname, '..', 'data', 'inventory.db')) {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
      reorder_level INTEGER NOT NULL DEFAULT 0 CHECK(reorder_level >= 0),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      customer_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      total_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price >= 0)
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      order_id INTEGER REFERENCES orders(id),
      change_quantity INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

function seedProducts(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  if (count) return;
  const add = db.prepare('INSERT INTO products (sku, name, unit_price, stock_quantity, reorder_level) VALUES (?, ?, ?, ?, ?)');
  const seed = db.transaction(() => {
    add.run('KB-100', 'Wireless Keyboard', 49.99, 15, 5);
    add.run('MS-200', 'Optical Mouse', 24.99, 8, 5);
    add.run('HD-300', 'USB-C Hub', 39.99, 3, 4);
  });
  seed();
}

module.exports = { createDatabase, seedProducts };
