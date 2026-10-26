const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../src/database');
const { addProduct, restockProduct, updateProduct, deactivateProduct } = require('../src/inventory');

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

test('products can be edited without changing stock and then deactivated', () => {
  const db = createDatabase(':memory:');
  const id = addProduct(db, { sku: 'P-1', name: 'Product', unitPrice: 10, stockQuantity: 4, reorderLevel: 1 });
  updateProduct(db, { productId: id, sku: 'P-2', name: 'Updated product', unitPrice: 12.5, reorderLevel: 3 });
  const edited = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  assert.equal(edited.sku, 'P-2');
  assert.equal(edited.stock_quantity, 4);
  deactivateProduct(db, id);
  assert.equal(db.prepare('SELECT active FROM products WHERE id = ?').get(id).active, 0);
});
