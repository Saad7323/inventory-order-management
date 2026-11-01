const v = require("./validation");
const { audit } = require("./audit");
const { recordMovement } = require("./inventory");
function createPurchaseOrder(db, body, actor) {
  const supplierId = v.integer(body.supplierId, "Supplier");
  const expected = body.expectedAt
    ? v.date(body.expectedAt, "Expected date")
    : null;
  const notes = v.text(body.notes, "Notes", { required: false, max: 2000 });
  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 100
  )
    throw new Error("Choose between 1 and 100 purchase order lines.");
  return db
    .transaction(() => {
      if (!db.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId))
        throw new Error("Supplier not found.");
      const seen = new Set();
      const lines = body.items.map((line) => {
        const productId = v.integer(line.productId, "Product");
        if (seen.has(productId))
          throw new Error(
            "Combine duplicate products into a single purchase line.",
          );
        seen.add(productId);
        if (
          !db
            .prepare(
              "SELECT p.id FROM products p JOIN product_suppliers ps ON ps.product_id = p.id WHERE p.id = ? AND p.active = 1 AND ps.supplier_id = ?",
            )
            .get(productId, supplierId)
        )
          throw new Error(
            "Each product must be active and associated with the selected supplier.",
          );
        return {
          productId,
          quantity: v.integer(line.quantity, "Purchase quantity"),
          cost: v.money(line.unitCost, "Unit cost"),
        };
      });
      const total = v.totalCents(
        lines,
        (line) => line.cost,
        (line) => line.quantity,
      );
      const id = db
        .prepare(
          "INSERT INTO purchase_orders (supplier_id, total_amount, notes, expected_at, created_by) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          supplierId,
          total,
          notes,
          expected,
          actor?.id || null,
        ).lastInsertRowid;
      for (const line of lines)
        db.prepare(
          "INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)",
        ).run(id, line.productId, line.quantity, line.cost);
      audit(db, actor, "purchase.created", "purchase_order", id, {
        supplierId,
        total,
      });
      return id;
    })
    .immediate();
}
function transitionPurchaseOrder(db, purchaseId, status, actor) {
  const id = v.integer(purchaseId, "Purchase order");
  if (!["received", "cancelled"].includes(status))
    throw new Error("Invalid purchase status.");
  db.transaction(() => {
    const order = db
      .prepare("SELECT * FROM purchase_orders WHERE id = ?")
      .get(id);
    if (!order || order.status !== "pending")
      throw new Error(
        "Only pending purchase orders can be received or cancelled.",
      );
    db.prepare(
      "UPDATE purchase_orders SET status = ?, received_at = CASE WHEN ? = 'received' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?",
    ).run(status, status, id);
    if (status === "received") {
      for (const item of db
        .prepare(
          "SELECT * FROM purchase_order_items WHERE purchase_order_id = ?",
        )
        .all(id)) {
        recordMovement(db, {
          productId: item.product_id,
          purchaseOrderId: id,
          quantity: item.quantity,
          reason: "Purchase order received",
          actor,
        });
      }
    }
    audit(db, actor, `purchase.${status}`, "purchase_order", id);
  }).immediate();
}
module.exports = { createPurchaseOrder, transitionPurchaseOrder };
