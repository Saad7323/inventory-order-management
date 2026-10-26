const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../src/database');
const { confirmOrder } = require('../src/orders');

function freshDatabase() {
  const db = createDatabase(':memory:');
  db.prepare('INSERT INTO products (sku, name, unit_price, stock_quantity, reorder_level) VALUES (?, ?, ?, ?, ?)').run('P-1', 'Test Product', 10, 5, 2);
  return db;
}

test('confirmed orders decrease stock and record movements', () => {
  const db = freshDatabase();
  const order = confirmOrder(db, { customerName: 'Asha', items: [{ productId: 1, quantity: 2 }] });
  assert.equal(order.total, 20);
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = 1').get().stock_quantity, 3);
  assert.equal(db.prepare('SELECT change_quantity FROM stock_movements').get().change_quantity, -2);
});

test('insufficient stock rejects the entire order without changing inventory', () => {
  const db = freshDatabase();
  assert.throws(() => confirmOrder(db, { customerName: 'Asha', items: [{ productId: 1, quantity: 6 }] }), /Insufficient stock/);
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = 1').get().stock_quantity, 5);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 0);
});
