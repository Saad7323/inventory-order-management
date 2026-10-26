function addProduct(db, { sku, name, unitPrice, stockQuantity, reorderLevel }) {
  const cleanSku = String(sku || '').trim().toUpperCase();
  const cleanName = String(name || '').trim();
  const price = Number(unitPrice);
  const stock = Number(stockQuantity);
  const reorder = Number(reorderLevel);
  if (!cleanSku || !cleanName) throw new Error('SKU and product name are required.');
  if (![price, stock, reorder].every(Number.isFinite) || price < 0 || stock < 0 || reorder < 0 || !Number.isInteger(stock) || !Number.isInteger(reorder)) {
    throw new Error('Use a valid price and whole-number stock quantities.');
  }
  try {
    return db.prepare('INSERT INTO products (sku, name, unit_price, stock_quantity, reorder_level) VALUES (?, ?, ?, ?, ?)').run(cleanSku, cleanName, price, stock, reorder).lastInsertRowid;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error('That SKU already exists.');
    throw error;
  }
}

function restockProduct(db, { productId, quantity }) {
  const id = Number(productId);
  const amount = Number(quantity);
  if (!Number.isInteger(id) || !Number.isInteger(amount) || amount <= 0) throw new Error('Restock quantity must be a positive whole number.');
  const restock = db.transaction(() => {
    const product = db.prepare('SELECT id FROM products WHERE id = ? AND active = 1').get(id);
    if (!product) throw new Error('Product not found.');
    db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?').run(amount, id);
    db.prepare("INSERT INTO stock_movements (product_id, change_quantity, reason) VALUES (?, ?, 'Stock restock')").run(id, amount);
  });
  restock();
}

module.exports = { addProduct, restockProduct };
