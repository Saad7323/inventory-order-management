const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../src/database');
const { addProduct, restockProduct } = require('../src/inventory');

test('adding a product stores its inventory details', () => {
  const db = createDatabase(':memory:');
  const id = addProduct(db, { sku: 'new-1', name: 'New product', unitPrice: '12.50', stockQuantity: '4', reorderLevel: '2' });
  assert.equal(db.prepare('SELECT sku, stock_quantity FROM products WHERE id = ?').get(id).sku, 'NEW-1');
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(id).stock_quantity, 4);
});

test('restocking increases stock and records a movement', () => {
  const db = createDatabase(':memory:');
  const id = addProduct(db, { sku: 'P-1', name: 'Product', unitPrice: 10, stockQuantity: 1, reorderLevel: 0 });
  restockProduct(db, { productId: id, quantity: 3 });
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(id).stock_quantity, 4);
  assert.equal(db.prepare('SELECT change_quantity FROM stock_movements WHERE product_id = ?').get(id).change_quantity, 3);
});
