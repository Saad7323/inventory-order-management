const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../src/database');
const { createApp } = require('../src/server');

async function startTestServer() {
  const db = createDatabase(':memory:');
  const server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { db, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('web order flow confirms an order and updates the rendered inventory', async (t) => {
  const { db, server, baseUrl } = await startTestServer();
  t.after(() => server.close());
  const product = db.prepare("SELECT id, stock_quantity FROM products WHERE sku = 'KB-100'").get();

  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ customerName: 'Jordan Lee', productId: String(product.id), quantity: '2' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /^\/orders\/\d+$/);
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(product.id).stock_quantity, product.stock_quantity - 2);

  const inventoryPage = await fetch(`${baseUrl}/`);
  assert.equal(inventoryPage.status, 200);
  assert.match(await inventoryPage.text(), /Wireless Keyboard/);
});

test('web order flow gives a clear error when stock is unavailable', async (t) => {
  const { db, server, baseUrl } = await startTestServer();
  t.after(() => server.close());
  const product = db.prepare("SELECT id FROM products WHERE sku = 'HD-300'").get();

  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ customerName: 'Jordan Lee', productId: String(product.id), quantity: '99' }),
  });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Insufficient stock for USB-C Hub/);
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(product.id).stock_quantity, 3);
});
