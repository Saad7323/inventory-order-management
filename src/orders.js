const v = require("./validation");
const { recordMovement } = require("./inventory");
const { audit } = require("./audit");
function confirmOrder(db, { customerName, customerId, items }, actor) {
  if (!Array.isArray(items) || !items.length || items.length > 100)
    throw new Error("Choose between 1 and 100 order lines.");
  return db
    .transaction(() => {
      let customer;
      if (customerId) {
        customer = db
          .prepare("SELECT * FROM customers WHERE id = ?")
          .get(v.integer(customerId, "Customer"));
        if (!customer) throw new Error("Customer not found.");
      } else {
        const name = v.text(customerName, "Customer name");
        customer = db
          .prepare(
            "SELECT * FROM customers WHERE name = ? COLLATE NOCASE ORDER BY id LIMIT 1",
          )
          .get(name);
        if (!customer)
          customer = {
            id: db.prepare("INSERT INTO customers (name) VALUES (?)").run(name)
              .lastInsertRowid,
            name,
          };
      }
      const combined = new Map();
      for (const line of items) {
        const id = v.integer(line.productId, "Product");
        const quantity = v.integer(line.quantity, "Order quantity");
        combined.set(id, (combined.get(id) || 0) + quantity);
      }
      const lines = [...combined].map(([id, quantity]) => {
        const product = db
          .prepare("SELECT * FROM products WHERE id = ? AND active = 1")
          .get(id);
        if (!product)
          throw new Error("One of the selected products is unavailable.");
        if (product.stock_quantity < quantity)
          throw new Error(`Insufficient stock for ${product.name}.`);
        return { product, quantity };
      });
      const total = v.totalCents(
        lines,
        (line) => line.product.unit_price,
        (line) => line.quantity,
      );
      const id = db
        .prepare(
          "INSERT INTO orders (customer_name, customer_id, total_amount, created_by) VALUES (?, ?, ?, ?)",
        )
        .run(
          customer.name,
          customer.id,
          total,
          actor?.id || null,
        ).lastInsertRowid;
      for (const { product, quantity } of lines) {
        db.prepare(
          "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
        ).run(id, product.id, quantity, product.unit_price);
        recordMovement(db, {
          productId: product.id,
          orderId: id,
          quantity: -quantity,
          reason: "Order confirmed",
          actor,
        });
      }
      audit(db, actor, "order.confirmed", "order", id, {
        customer: customer.name,
        total,
        items: lines.length,
      });
      return { id, total };
    })
    .immediate();
}
function cancelOrder(db, orderId, actor) {
  const id = v.integer(orderId, "Order");
  return db
    .transaction(() => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
      if (!order) throw new Error("Order not found.");
      if (order.status !== "confirmed")
        throw new Error(
          "Only confirmed orders can be cancelled. Stock has not been changed.",
        );
      db.prepare(
        "UPDATE orders SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'confirmed'",
      ).run(id);
      for (const item of db
        .prepare("SELECT * FROM order_items WHERE order_id = ?")
        .all(id)) {
        recordMovement(db, {
          productId: item.product_id,
          orderId: id,
          quantity: item.quantity,
          reason: "Order cancelled",
          actor,
        });
      }
      audit(
        db,
        actor,
        "order.cancelled",
        "order",
        id,
        "All line quantities restored to inventory.",
      );
    })
    .immediate();
}
module.exports = { confirmOrder, cancelOrder };
