const express = require('express');
const path = require('node:path');
const { createDatabase, seedProducts } = require('./database');
const { confirmOrder } = require('./orders');
const { addProduct, restockProduct, updateProduct, deactivateProduct } = require('./inventory');

function createApp(db = createDatabase()) {
  seedProducts(db);
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/', (req, res) => {
    const query = String(req.query.q || '').trim();
    const products = db.prepare('SELECT * FROM products WHERE active = 1 AND (sku LIKE ? OR name LIKE ?) ORDER BY name').all(`%${query}%`, `%${query}%`);
    const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 5').all();
    res.render('index', { products, recentOrders, error: null, query });
  });
  app.post('/orders', (req, res) => {
    const items = Array.isArray(req.body.productId) ? req.body.productId.map((productId, index) => ({ productId, quantity: req.body.quantity[index] })) : [{ productId: req.body.productId, quantity: req.body.quantity }];
    try {
      const order = confirmOrder(db, { customerName: req.body.customerName, items });
      res.redirect(`/orders/${order.id}`);
    } catch (error) {
      const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
      const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 5').all();
      res.status(400).render('index', { products, recentOrders, error: error.message, query: '' });
    }
  });
  app.post('/products', (req, res) => {
    try {
      addProduct(db, req.body);
      res.redirect('/');
    } catch (error) {
      const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
      const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 5').all();
      res.status(400).render('index', { products, recentOrders, error: error.message, query: '' });
    }
  });
  app.post('/products/:id/restock', (req, res) => {
    try {
      restockProduct(db, { productId: req.params.id, quantity: req.body.quantity });
      res.redirect('/');
    } catch (error) {
      const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
      const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 5').all();
      res.status(400).render('index', { products, recentOrders, error: error.message, query: '' });
    }
  });
  app.get('/products/:id/edit', (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
    if (!product) return res.status(404).send('Product not found');
    res.render('product-edit', { product, error: null });
  });
  app.post('/products/:id', (req, res) => {
    try {
      updateProduct(db, { productId: req.params.id, ...req.body });
      res.redirect('/');
    } catch (error) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return res.status(404).send('Product not found');
      res.status(400).render('product-edit', { product: { ...product, ...req.body }, error: error.message });
    }
  });
  app.post('/products/:id/deactivate', (req, res) => {
    try {
      deactivateProduct(db, req.params.id);
      res.redirect('/');
    } catch (error) {
      res.status(400).send(error.message);
    }
  });
  app.get('/orders', (req, res) => {
    const query = String(req.query.q || '').trim();
    const orders = db.prepare('SELECT * FROM orders WHERE customer_name LIKE ? OR CAST(id AS TEXT) LIKE ? ORDER BY created_at DESC, id DESC').all(`%${query}%`, `%${query}%`);
    res.render('orders', { orders, query });
  });
  app.get('/orders/:id', (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).send('Order not found');
    const items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?').all(order.id);
    res.render('order', { order, items });
  });
  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(3000, () => console.log('Inventory app running at http://localhost:3000'));
}

module.exports = { createApp };
