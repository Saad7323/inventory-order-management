const express = require('express');
const path = require('node:path');
const { createDatabase, seedProducts } = require('./database');
const { confirmOrder } = require('./orders');

function createApp(db = createDatabase()) {
  seedProducts(db);
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/', (_req, res) => {
    const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
    res.render('index', { products, error: null });
  });
  app.post('/orders', (req, res) => {
    const items = Array.isArray(req.body.productId) ? req.body.productId.map((productId, index) => ({ productId, quantity: req.body.quantity[index] })) : [{ productId: req.body.productId, quantity: req.body.quantity }];
    try {
      const order = confirmOrder(db, { customerName: req.body.customerName, items });
      res.redirect(`/orders/${order.id}`);
    } catch (error) {
      const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
      res.status(400).render('index', { products, error: error.message });
    }
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
