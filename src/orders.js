function confirmOrder(db, { customerName, items }) {
  const cleanName = String(customerName || '').trim();
  if (!cleanName) throw new Error('A customer name is required.');
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one product is required.');

  const placeOrder = db.transaction(() => {
    const requestedByProduct = new Map();
    for (const { productId, quantity } of items) {
      const id = Number(productId);
      const requested = Number(quantity);
      if (!Number.isInteger(id) || !Number.isInteger(requested) || requested <= 0) {
        throw new Error('Each order quantity must be a positive whole number.');
      }
      requestedByProduct.set(id, (requestedByProduct.get(id) || 0) + requested);
    }
    const lines = [...requestedByProduct].map(([id, quantity]) => {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id);
      if (!product) throw new Error('One of the selected products is unavailable.');
      if (product.stock_quantity < quantity) throw new Error(`Insufficient stock for ${product.name}.`);
      return { product, quantity };
    });
    const total = lines.reduce((sum, line) => sum + line.product.unit_price * line.quantity, 0);
    const order = db.prepare('INSERT INTO orders (customer_name, total_amount) VALUES (?, ?)').run(cleanName, total);
    const addItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)');
    const updateStock = db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?');
    const movement = db.prepare('INSERT INTO stock_movements (product_id, order_id, change_quantity, reason) VALUES (?, ?, ?, ?)');
    for (const line of lines) {
      addItem.run(order.lastInsertRowid, line.product.id, line.quantity, line.product.unit_price);
      updateStock.run(line.quantity, line.product.id);
      movement.run(line.product.id, order.lastInsertRowid, -line.quantity, 'Order confirmed');
    }
    return { id: order.lastInsertRowid, total };
  });
  return placeOrder();
}

module.exports = { confirmOrder };
