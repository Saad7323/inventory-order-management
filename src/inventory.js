const v = require("./validation");
const { audit } = require("./audit");

function recordMovement(
  db,
  {
    productId,
    quantity,
    reason,
    orderId = null,
    purchaseOrderId = null,
    actor,
  },
) {
  const result = db
    .prepare(
      "UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock_quantity + ? BETWEEN 0 AND 100000000",
    )
    .run(quantity, productId, quantity);
  if (!result.changes)
    throw new Error("Stock adjustment would produce an invalid quantity.");
  const balance = db
    .prepare("SELECT stock_quantity FROM products WHERE id = ?")
    .get(productId).stock_quantity;
  db.prepare(
    "INSERT INTO stock_movements (product_id, order_id, purchase_order_id, change_quantity, reason, balance_after, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    productId,
    orderId,
    purchaseOrderId,
    quantity,
    reason,
    balance,
    actor?.id || null,
  );
}
function setSuppliers(db, id, supplierIds) {
  if (supplierIds === undefined) return;
  const ids = [
    ...new Set(
      (Array.isArray(supplierIds) ? supplierIds : [supplierIds])
        .filter(Boolean)
        .map((value) => v.integer(value, "Supplier")),
    ),
  ];
  for (const supplierId of ids)
    if (!db.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId))
      throw new Error("Supplier not found.");
  db.prepare("DELETE FROM product_suppliers WHERE product_id = ?").run(id);
  for (const supplierId of ids)
    db.prepare("INSERT INTO product_suppliers VALUES (?, ?)").run(
      id,
      supplierId,
    );
}
function productValues(body) {
  return [
    v.text(body.sku, "SKU", { max: 60 }).toUpperCase(),
    v.text(body.name, "Product name"),
    v.money(body.unitPrice),
    v.integer(body.reorderLevel, "Reorder level", 0),
    v.text(body.category || "General", "Category", { max: 60 }),
  ];
}
function uniqueError(error) {
  if (error.code === "SQLITE_CONSTRAINT_UNIQUE")
    throw new Error("That SKU already exists.");
  throw error;
}
function addProduct(db, body, actor) {
  try {
    return db
      .transaction(() => {
        const [sku, name, price, reorder, category] = productValues(body);
        const stock = v.integer(body.stockQuantity, "Opening stock", 0);
        const id = db
          .prepare(
            "INSERT INTO products (sku, name, unit_price, reorder_level, category, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
          )
          .run(sku, name, price, reorder, category).lastInsertRowid;
        if (stock)
          recordMovement(db, {
            productId: id,
            quantity: stock,
            reason: "Opening balance",
            actor,
          });
        setSuppliers(db, id, body.supplierIds);
        audit(db, actor, "product.created", "product", id, {
          sku,
          name,
          stock,
        });
        return id;
      })
      .immediate();
  } catch (error) {
    uniqueError(error);
  }
}
function restockProduct(db, { productId, quantity }, actor) {
  return adjustStock(
    db,
    {
      productId,
      quantity: v.integer(quantity, "Restock quantity"),
      reason: "Stock restock",
    },
    actor,
  );
}
function adjustStock(db, { productId, quantity, reason }, actor) {
  const id = v.integer(productId, "Product");
  const amount = v.integer(quantity, "Adjustment", -100000000);
  if (!amount) throw new Error("Adjustment cannot be zero.");
  const description = v.text(reason, "Reason", { max: 300 });
  db.transaction(() => {
    if (
      !db.prepare("SELECT id FROM products WHERE id = ? AND active = 1").get(id)
    )
      throw new Error("Product not found.");
    recordMovement(db, {
      productId: id,
      quantity: amount,
      reason: description,
      actor,
    });
    audit(db, actor, "stock.adjusted", "product", id, {
      quantity: amount,
      reason: description,
    });
  }).immediate();
}
function updateProduct(db, body, actor) {
  try {
    db.transaction(() => {
      const id = v.integer(body.productId, "Product");
      const values = productValues(body);
      const before = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
      if (!before) throw new Error("Product not found.");
      db.prepare(
        "UPDATE products SET sku = ?, name = ?, unit_price = ?, reorder_level = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(...values, id);
      setSuppliers(db, id, body.supplierIds);
      audit(db, actor, "product.updated", "product", id, {
        before: {
          sku: before.sku,
          name: before.name,
          price: before.unit_price,
          reorder: before.reorder_level,
          category: before.category,
        },
        after: values,
      });
    }).immediate();
  } catch (error) {
    uniqueError(error);
  }
}
function deactivateProduct(db, productId, actor) {
  setProductActive(db, productId, 0, actor);
}
function setProductActive(db, productId, active, actor) {
  const id = v.integer(productId, "Product");
  db.transaction(() => {
    const result = db
      .prepare(
        "UPDATE products SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND active != ?",
      )
      .run(active, id, active);
    if (!result.changes)
      throw new Error("Product not found or already in that state.");
    audit(
      db,
      actor,
      active ? "product.reactivated" : "product.deactivated",
      "product",
      id,
    );
  }).immediate();
}
module.exports = {
  addProduct,
  restockProduct,
  adjustStock,
  updateProduct,
  deactivateProduct,
  setProductActive,
  recordMovement,
};
