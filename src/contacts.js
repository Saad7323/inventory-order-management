const v = require("./validation");
const { audit } = require("./audit");
function saveContact(db, type, body, actor, id) {
  if (!["customers", "suppliers"].includes(type))
    throw new Error("Invalid contact type.");
  const c = v.contact(body);
  return db
    .transaction(() => {
      let resultId;
      if (id) {
        resultId = v.integer(id, "Contact");
        if (
          !db
            .prepare(
              `UPDATE ${type} SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?`,
            )
            .run(c.name, c.email, c.phone, c.address, resultId).changes
        )
          throw new Error("Contact not found.");
      } else
        resultId = db
          .prepare(
            `INSERT INTO ${type} (name, email, phone, address) VALUES (?, ?, ?, ?)`,
          )
          .run(c.name, c.email, c.phone, c.address).lastInsertRowid;
      if (type === "suppliers") {
        db.prepare("UPDATE suppliers SET contact_name = ? WHERE id = ?").run(
          v.text(body.contactName, "Contact name", { required: false }),
          resultId,
        );
        if (body.productIds !== undefined) {
          const productIds = [
            ...new Set(
              (Array.isArray(body.productIds)
                ? body.productIds
                : [body.productIds]
              )
                .filter(Boolean)
                .map((value) => v.integer(value, "Product")),
            ),
          ];
          for (const productId of productIds)
            if (
              !db.prepare("SELECT id FROM products WHERE id = ?").get(productId)
            )
              throw new Error("Product not found.");
          db.prepare("DELETE FROM product_suppliers WHERE supplier_id = ?").run(
            resultId,
          );
          for (const productId of productIds)
            db.prepare("INSERT INTO product_suppliers VALUES (?, ?)").run(
              productId,
              resultId,
            );
        }
      }
      audit(
        db,
        actor,
        `${type === "customers" ? "customer" : "supplier"}.${id ? "updated" : "created"}`,
        type.slice(0, -1),
        resultId,
        c,
      );
      return resultId;
    })
    .immediate();
}
module.exports = { saveContact };
