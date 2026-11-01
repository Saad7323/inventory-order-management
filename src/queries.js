const v = require("./validation");
function pageQuery(db, select, from, where, params, order, query = {}) {
  const total = db
    .prepare(`SELECT COUNT(*) AS count ${from} WHERE ${where}`)
    .get(...params).count;
  const limit = [10, 25, 50].includes(Number(query.limit))
    ? Number(query.limit)
    : 10;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(
    pages,
    Math.max(1, Math.floor(Number(query.page) || 1)),
  );
  return {
    rows: db
      .prepare(
        `SELECT ${select} ${from} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, (page - 1) * limit),
    total,
    page,
    pages,
    limit,
  };
}
function productFilter(query) {
  const clauses = ["1=1"];
  const params = [];
  const q = String(query.q || "")
    .trim()
    .slice(0, 160);
  if (q) {
    clauses.push("(p.sku LIKE ? OR p.name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const status = String(query.status || "all");
  if (status === "discontinued") clauses.push("p.active = 0");
  else {
    clauses.push("p.active = 1");
    if (status === "in-stock")
      clauses.push("p.stock_quantity > p.reorder_level");
    if (status === "low-stock")
      clauses.push(
        "p.stock_quantity > 0 AND p.stock_quantity <= p.reorder_level",
      );
    if (status === "out-of-stock") clauses.push("p.stock_quantity = 0");
    if (status === "needs-restock")
      clauses.push("p.stock_quantity <= p.reorder_level");
  }
  if (query.category) {
    clauses.push("p.category = ?");
    params.push(String(query.category));
  }
  if (query.supplier) {
    clauses.push(
      "EXISTS (SELECT 1 FROM product_suppliers ps WHERE ps.product_id = p.id AND ps.supplier_id = ?)",
    );
    params.push(v.integer(query.supplier, "Supplier"));
  }
  if (query.minPrice) {
    clauses.push("p.unit_price >= ?");
    params.push(v.money(query.minPrice, "Minimum price"));
  }
  if (query.maxPrice) {
    clauses.push("p.unit_price <= ?");
    params.push(v.money(query.maxPrice, "Maximum price"));
  }
  return { where: clauses.join(" AND "), params };
}
function products(db, query) {
  const { where, params } = productFilter(query);
  const sorts = {
    name: "p.name COLLATE NOCASE",
    stock: "p.stock_quantity",
    value: "p.stock_quantity * p.unit_price",
    updated: "p.updated_at",
    price: "p.unit_price",
  };
  return pageQuery(
    db,
    "p.*",
    "FROM products p",
    where,
    params,
    `${sorts[query.sort] || sorts.name} ${query.direction === "desc" ? "DESC" : "ASC"}, p.id`,
    query,
  );
}
function dateFilter(query, column, clauses, params) {
  if (query.from) {
    clauses.push(`${column} >= ?`);
    params.push(v.date(query.from, "Start date"));
  }
  if (query.to) {
    clauses.push(`${column} < datetime(?, '+1 day')`);
    params.push(v.date(query.to, "End date"));
  }
  if (query.from && query.to && query.from > query.to)
    throw new v.ValidationError(
      "Start date must be before or equal to end date.",
    );
}
function orderFilter(query) {
  const clauses = ["1=1"];
  const params = [];
  if (query.q) {
    clauses.push("(o.customer_name LIKE ? OR CAST(o.id AS TEXT) LIKE ?)");
    params.push(
      `%${String(query.q).slice(0, 160)}%`,
      `%${String(query.q).slice(0, 160)}%`,
    );
  }
  if (["confirmed", "cancelled"].includes(query.status)) {
    clauses.push("o.status = ?");
    params.push(query.status);
  }
  if (query.customer) {
    clauses.push("o.customer_id = ?");
    params.push(v.integer(query.customer, "Customer"));
  }
  if (query.minTotal) {
    clauses.push("o.total_amount >= ?");
    params.push(v.money(query.minTotal, "Minimum total"));
  }
  if (query.maxTotal) {
    clauses.push("o.total_amount <= ?");
    params.push(v.money(query.maxTotal, "Maximum total"));
  }
  dateFilter(query, "o.created_at", clauses, params);
  return { where: clauses.join(" AND "), params };
}
function orders(db, query) {
  const { where, params } = orderFilter(query);
  return pageQuery(
    db,
    "o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS units",
    "FROM orders o",
    where,
    params,
    query.sort === "total"
      ? "o.total_amount DESC, o.id DESC"
      : "o.created_at DESC, o.id DESC",
    query,
  );
}
function inventoryStats(db) {
  return db
    .prepare(
      `SELECT COUNT(*) AS products, COALESCE(SUM(stock_quantity),0) AS units,
    COALESCE(SUM(stock_quantity * unit_price),0) AS value,
    COALESCE(SUM(stock_quantity > 0 AND stock_quantity <= reorder_level),0) AS low,
    COALESCE(SUM(stock_quantity = 0),0) AS out,
    COALESCE(SUM(stock_quantity > reorder_level),0) AS healthy FROM products WHERE active = 1`,
    )
    .get();
}
function report(db, query = {}) {
  const clauses = ["1=1"];
  const params = [];
  dateFilter(query, "o.created_at", clauses, params);
  const where = clauses.join(" AND ");
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(status='confirmed'),0) AS confirmed,
    COALESCE(SUM(status='cancelled'),0) AS cancelled,
    ROUND(COALESCE(SUM(CASE WHEN status='confirmed' THEN total_amount ELSE 0 END),0),2) AS revenue,
    ROUND(COALESCE(AVG(CASE WHEN status='confirmed' THEN total_amount END),0),2) AS average FROM orders o WHERE ${where}`,
    )
    .get(...params);
  const daily = db
    .prepare(
      `SELECT date(o.created_at) AS day, ROUND(SUM(o.total_amount),2) AS revenue, COUNT(*) AS orders FROM orders o WHERE ${where} AND o.status='confirmed' GROUP BY day ORDER BY day`,
    )
    .all(...params);
  const top = db
    .prepare(
      `SELECT p.id, p.name, p.sku, SUM(oi.quantity) AS units, ROUND(SUM(oi.quantity*oi.unit_price),2) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE ${where} AND o.status='confirmed' GROUP BY p.id ORDER BY revenue DESC LIMIT 5`,
    )
    .all(...params);
  const movementClauses = ["1=1"];
  const movementParams = [];
  dateFilter(query, "sm.created_at", movementClauses, movementParams);
  // Opening/closing quantities are reconstructed from the immutable movement ledger.
  const inventory = db
    .prepare(
      `SELECT p.*,
    p.stock_quantity - COALESCE((SELECT SUM(sm.change_quantity) FROM stock_movements sm WHERE sm.product_id=p.id AND (? IS NULL OR sm.created_at >= ?)),0) AS opening,
    p.stock_quantity - COALESCE((SELECT SUM(sm.change_quantity) FROM stock_movements sm WHERE sm.product_id=p.id AND ? IS NOT NULL AND sm.created_at >= datetime(?, '+1 day')),0) AS closing,
    COALESCE((SELECT SUM(CASE WHEN sm.change_quantity>0 THEN sm.change_quantity ELSE 0 END) FROM stock_movements sm WHERE sm.product_id=p.id AND ${movementClauses.join(" AND ")}),0) AS increases,
    COALESCE((SELECT SUM(CASE WHEN sm.change_quantity<0 THEN -sm.change_quantity ELSE 0 END) FROM stock_movements sm WHERE sm.product_id=p.id AND ${movementClauses.join(" AND ")}),0) AS decreases
    FROM products p ORDER BY p.name`,
    )
    .all(
      query.from || null,
      query.from || null,
      query.to || null,
      query.to || null,
      ...movementParams,
      ...movementParams,
    );
  return { stats, daily, top, inventory };
}
function salesTrend(daily, from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const count =
    Math.floor((Date.parse(`${to}T00:00:00Z`) - start) / 86400000) + 1;
  // Zero-sale days must occupy their place on the axis. Long ranges use bounded buckets.
  const interval = Math.max(1, Math.ceil(count / 120));
  if (!daily.length) return { points: [], interval };
  const points = Array.from(
    { length: Math.ceil(count / interval) },
    (_, i) => ({
      day: new Date(start + i * interval * 86400000).toISOString().slice(0, 10),
      revenue: 0,
      orders: 0,
    }),
  );
  for (const row of daily) {
    const index = Math.floor(
      (Date.parse(`${row.day}T00:00:00Z`) - start) / (interval * 86400000),
    );
    if (points[index]) {
      points[index].revenue =
        Math.round((points[index].revenue + row.revenue) * 100) / 100;
      points[index].orders += row.orders;
    }
  }
  return { points, interval };
}
function valueHistory(db, days = 30) {
  const current = inventoryStats(db).value;
  const deltas = db
    .prepare(
      "SELECT date(sm.created_at) AS day, SUM(sm.change_quantity * p.unit_price) AS delta FROM stock_movements sm JOIN products p ON p.id=sm.product_id WHERE p.active=1 AND sm.created_at >= date('now', ?) GROUP BY day",
    )
    .all(`-${days - 1} days`);
  const byDay = new Map(deltas.map((row) => [row.day, row.delta]));
  let value = current;
  const result = [];
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(Date.now() - offset * 86400000)
      .toISOString()
      .slice(0, 10);
    result.unshift({ day, value: Math.max(0, value) });
    value -= byDay.get(day) || 0;
  }
  return result;
}
function csv(rows, columns) {
  const cell = (value) => {
    let s = String(value ?? "");
    if (/^[\s]*[=+\-@]/.test(s) && typeof value !== "number") s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [
      columns.map(([name]) => cell(name)).join(","),
      ...rows.map((row) =>
        columns
          .map(([, key]) =>
            cell(typeof key === "function" ? key(row) : row[key]),
          )
          .join(","),
      ),
    ].join("\r\n")
  );
}
module.exports = {
  pageQuery,
  productFilter,
  products,
  orderFilter,
  orders,
  inventoryStats,
  report,
  salesTrend,
  valueHistory,
  dateFilter,
  csv,
};
