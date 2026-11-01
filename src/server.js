const express = require("express");
const path = require("node:path");
const { createDatabase, seedProducts } = require("./database");
const inventory = require("./inventory");
const { confirmOrder, cancelOrder } = require("./orders");
const { saveContact } = require("./contacts");
const {
  createPurchaseOrder,
  transitionPurchaseOrder,
} = require("./purchasing");
const auth = require("./auth");
const { audit } = require("./audit");
const { exportBackup, restoreBackup } = require("./backup");
const q = require("./queries");
const v = require("./validation");
const ui = require("./ui");

function createApp(
  db = createDatabase(process.env.DATABASE_PATH),
  { seed = true } = {},
) {
  if (seed) seedProducts(db);
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(
    // URL encoding can triple the size of a valid 7 MB JSON backup.
    express.urlencoded({ extended: true, limit: "24mb", parameterLimit: 1000 }),
  );
  app.use(auth.authContext(db));
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    Object.assign(res.locals, ui, {
      title: "StockPilot",
      active: "",
      query: req.query,
      error: null,
      notice: String(req.query.notice || "").slice(0, 250),
      lowCount: db
        .prepare(
          "SELECT COUNT(*) AS n FROM products WHERE active=1 AND stock_quantity<=reorder_level",
        )
        .get().n,
      url: (changes) => {
        const params = new URLSearchParams(
          Object.entries({ ...req.query, ...changes }).filter(
            ([, value]) =>
              value !== undefined && value !== null && value !== "",
          ),
        );
        return req.path + (params.size ? `?${params}` : "");
      },
    });
    if (
      !db.prepare("SELECT id FROM users LIMIT 1").get() &&
      req.path !== "/setup"
    )
      return res.redirect("/setup");
    next();
  });
  const action =
    (handler, returnPath = "/") =>
    (req, res, next) => {
      try {
        handler(req, res);
      } catch (error) {
        error.status = 400;
        error.returnPath = returnPath;
        next(error);
      }
    };
  const redirect = (res, to, notice) =>
    res.redirect(
      `${to}${to.includes("?") ? "&" : "?"}notice=${encodeURIComponent(notice)}`,
    );
  const lookups = () => ({
    products: db
      .prepare("SELECT * FROM products WHERE active=1 ORDER BY name")
      .all(),
    customers: db.prepare("SELECT * FROM customers ORDER BY name").all(),
    suppliers: db.prepare("SELECT * FROM suppliers ORDER BY name").all(),
  });
  const itemsFromBody = (body) => {
    const ids = Array.isArray(body.productId)
      ? body.productId
      : [body.productId];
    const quantities = Array.isArray(body.quantity)
      ? body.quantity
      : [body.quantity];
    const costs = Array.isArray(body.unitCost)
      ? body.unitCost
      : [body.unitCost];
    return ids.map((productId, index) => ({
      productId,
      quantity: quantities[index],
      unitCost: costs[index],
    }));
  };

  app.get("/setup", (req, res) => {
    if (db.prepare("SELECT id FROM users LIMIT 1").get())
      return res.redirect(req.user ? "/" : "/login");
    res.render("auth", { setup: true, error: null, values: {} });
  });
  app.post("/setup", (req, res) => {
    if (db.prepare("SELECT id FROM users LIMIT 1").get())
      return res.status(403).render("error", {
        title: "Setup completed",
        message: "A manager account already exists. Sign in to continue.",
      });
    try {
      const id = auth.createUser(db, { ...req.body, role: "manager" });
      auth.startSession(db, req, res, id);
      res.redirect("/");
    } catch (error) {
      res.status(400).render("auth", {
        setup: true,
        error: error.message,
        values: req.body,
      });
    }
  });
  app.get("/login", (req, res) =>
    req.user
      ? res.redirect("/")
      : res.render("auth", { setup: false, error: null, values: {} }),
  );
  const attempts = new Map();
  app.post("/login", (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until < now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
    if (entry.count >= 8)
      return res.status(429).render("auth", {
        setup: false,
        error: "Too many attempts. Try again in 15 minutes.",
        values: req.body,
      });
    const user = db
      .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
      .get(String(req.body.email || "").trim());
    const valid = auth.verifyPassword(req.body.password, user?.password_hash);
    if (!valid || !user?.active) {
      entry.count++;
      attempts.set(key, entry);
      audit(
        db,
        null,
        "auth.failed",
        "session",
        null,
        "Unsuccessful sign-in attempt.",
      );
      return res.status(401).render("auth", {
        setup: false,
        error: "Email or password is incorrect.",
        values: req.body,
      });
    }
    attempts.delete(key);
    auth.endSession(db, req, res);
    auth.startSession(db, req, res, user.id);
    audit(db, user, "auth.login", "session", null);
    res.redirect("/");
  });
  app.use(auth.requireAuth);
  app.post("/logout", (req, res) => {
    audit(db, req.user, "auth.logout", "session", null);
    auth.endSession(db, req, res);
    res.redirect("/login");
  });

  app.get("/", (req, res) => {
    const result = q.products(db, req.query);
    const days = [7, 30, 90].includes(Number(req.query.days))
      ? Number(req.query.days)
      : 30;
    res.render("index", {
      title: "Inventory",
      active: "inventory",
      result,
      stats: q.inventoryStats(db),
      history: q.valueHistory(db, days),
      days,
      categories: db
        .prepare("SELECT DISTINCT category FROM products ORDER BY category")
        .all(),
      suppliers: db
        .prepare("SELECT id,name FROM suppliers ORDER BY name")
        .all(),
      lowProducts: db
        .prepare(
          "SELECT * FROM products WHERE active=1 AND stock_quantity<=reorder_level ORDER BY stock_quantity, name LIMIT 4",
        )
        .all(),
    });
  });
  app.get("/dashboard", auth.requireManager, (req, res) => {
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const from =
      req.query.from ||
      new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const data = q.report(db, { from, to });
    const trend = q.salesTrend(data.daily, from, to);
    res.render("dashboard", {
      title: "Sales overview",
      active: "dashboard",
      ...data,
      trend,
      from,
      to,
      inventory: q.inventoryStats(db),
      recentOrders: db
        .prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 5")
        .all(),
    });
  });
  app.get("/products/new", auth.requireManager, (req, res) =>
    res.render("product-edit", {
      title: "Add product",
      active: "inventory",
      product: null,
      suppliers: lookups().suppliers,
      selectedSuppliers: [],
    }),
  );
  app.get("/products/:id/edit", auth.requireManager, (req, res) => {
    const product = db
      .prepare("SELECT * FROM products WHERE id=?")
      .get(req.params.id);
    if (!product)
      return res.status(404).render("error", {
        title: "Product not found",
        message: "This product does not exist.",
      });
    res.render("product-edit", {
      title: "Edit product",
      active: "inventory",
      product,
      suppliers: lookups().suppliers,
      selectedSuppliers: db
        .prepare("SELECT supplier_id FROM product_suppliers WHERE product_id=?")
        .all(product.id)
        .map((r) => r.supplier_id),
    });
  });
  app.post(
    "/products",
    auth.requireManager,
    action((req, res) => {
      inventory.addProduct(db, req.body, req.user);
      redirect(res, "/", "Product added to inventory.");
    }, "/products/new"),
  );
  app.post(
    "/products/:id",
    auth.requireManager,
    action((req, res) => {
      inventory.updateProduct(
        db,
        { ...req.body, productId: req.params.id },
        req.user,
      );
      redirect(res, "/", "Product details updated.");
    }),
  );
  app.post(
    "/products/:id/restock",
    auth.requireManager,
    action((req, res) => {
      inventory.restockProduct(
        db,
        { productId: req.params.id, quantity: req.body.quantity },
        req.user,
      );
      redirect(res, "/", "Stock received and movement recorded.");
    }),
  );
  app.post(
    "/products/:id/adjust",
    auth.requireManager,
    action((req, res) => {
      inventory.adjustStock(
        db,
        { ...req.body, productId: req.params.id },
        req.user,
      );
      redirect(res, "/movements", "Stock adjusted and movement recorded.");
    }),
  );
  app.post(
    "/products/:id/deactivate",
    auth.requireManager,
    action((req, res) => {
      inventory.deactivateProduct(db, req.params.id, req.user);
      redirect(
        res,
        "/",
        "Product discontinued. Historical records are retained.",
      );
    }),
  );
  app.post(
    "/products/:id/reactivate",
    auth.requireManager,
    action((req, res) => {
      inventory.setProductActive(db, req.params.id, 1, req.user);
      redirect(res, "/", "Product reactivated.");
    }),
  );

  app.get("/orders", (req, res) =>
    res.render("orders", {
      title: "Orders",
      active: "orders",
      result: q.orders(db, req.query),
      customers: lookups().customers,
    }),
  );
  app.get("/orders/new", (req, res) =>
    res.render("order-form", {
      title: "Create order",
      active: "orders",
      ...lookups(),
    }),
  );
  app.post(
    "/orders",
    action((req, res) => {
      const order = confirmOrder(
        db,
        { ...req.body, items: itemsFromBody(req.body) },
        req.user,
      );
      res.redirect(`/orders/${order.id}`);
    }, "/orders/new"),
  );
  app.get("/orders/:id", (req, res) => {
    const order = db
      .prepare(
        "SELECT o.*, c.email, c.phone, c.address, u.name AS created_by_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.created_by WHERE o.id=?",
      )
      .get(req.params.id);
    if (!order)
      return res.status(404).render("error", {
        title: "Order not found",
        message: "This order does not exist.",
      });
    const items = db
      .prepare(
        "SELECT oi.*, p.name, p.sku, p.category FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?",
      )
      .all(order.id);
    res.render("order", {
      title: `Order #${String(order.id).padStart(4, "0")}`,
      active: "orders",
      order,
      items,
    });
  });
  app.post(
    "/orders/:id/cancel",
    auth.requireManager,
    action((req, res) => {
      cancelOrder(db, req.params.id, req.user);
      redirect(
        res,
        `/orders/${Number(req.params.id)}`,
        "Order cancelled. All stock has been restored.",
      );
    }, "/orders"),
  );

  app.get("/movements", (req, res) => {
    const clauses = ["1=1"];
    const params = [];
    if (req.query.q) {
      clauses.push("(p.name LIKE ? OR p.sku LIKE ? OR sm.reason LIKE ?)");
      const match = `%${String(req.query.q).slice(0, 160)}%`;
      params.push(match, match, match);
    }
    if (req.query.direction === "in") clauses.push("sm.change_quantity>0");
    if (req.query.direction === "out") clauses.push("sm.change_quantity<0");
    if (req.query.product) {
      clauses.push("sm.product_id=?");
      params.push(v.integer(req.query.product, "Product"));
    }
    q.dateFilter(req.query, "sm.created_at", clauses, params);
    const result = q.pageQuery(
      db,
      "sm.*, p.name, p.sku, p.category, u.name AS actor",
      "FROM stock_movements sm JOIN products p ON p.id=sm.product_id LEFT JOIN users u ON u.id=sm.created_by",
      clauses.join(" AND "),
      params,
      "sm.created_at DESC, sm.id DESC",
      req.query,
    );
    res.render("movements", {
      title: "Stock movements",
      active: "movements",
      result,
      products: db.prepare("SELECT id,name FROM products ORDER BY name").all(),
    });
  });

  for (const type of ["customers", "suppliers"]) {
    const role =
      type === "suppliers" ? auth.requireManager : (req, res, next) => next();
    app.get(`/${type}`, role, (req, res) => {
      const search = `%${String(req.query.q || "").slice(0, 160)}%`;
      const extra =
        type === "customers"
          ? ", (SELECT COUNT(*) FROM orders WHERE customer_id=c.id) AS order_count, (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE customer_id=c.id AND status='confirmed') AS spent"
          : ", (SELECT COUNT(*) FROM product_suppliers WHERE supplier_id=c.id) AS product_count";
      const result = q.pageQuery(
        db,
        `c.*${extra}`,
        `FROM ${type} c`,
        "(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)",
        [search, search, search],
        "c.name COLLATE NOCASE, c.id",
        req.query,
      );
      res.render("contacts", {
        title: type === "customers" ? "Customers" : "Suppliers",
        active: type,
        type,
        result,
      });
    });
    app.get(`/${type}/new`, role, (req, res) =>
      res.render("contact-form", {
        title: `Add ${type.slice(0, -1)}`,
        active: type,
        type,
        contact: null,
        products: lookups().products,
        selectedProducts: [],
      }),
    );
    app.post(
      `/${type}`,
      role,
      action((req, res) => {
        const id = saveContact(db, type, req.body, req.user);
        redirect(res, `/${type}/${id}`, "Contact created.");
      }, `/${type}/new`),
    );
    app.get(`/${type}/:id`, role, (req, res) => {
      const contact = db
        .prepare(`SELECT * FROM ${type} WHERE id=?`)
        .get(req.params.id);
      if (!contact)
        return res.status(404).render("error", {
          title: "Contact not found",
          message: "This contact does not exist.",
        });
      const history =
        type === "customers"
          ? q.orders(db, { ...req.query, customer: contact.id })
          : q.pageQuery(
              db,
              "po.*",
              "FROM purchase_orders po",
              "po.supplier_id=?",
              [contact.id],
              "po.created_at DESC, po.id DESC",
              req.query,
            );
      const associated =
        type === "suppliers"
          ? db
              .prepare(
                "SELECT p.* FROM products p JOIN product_suppliers ps ON ps.product_id=p.id WHERE ps.supplier_id=? ORDER BY p.name",
              )
              .all(contact.id)
          : [];
      const summary =
        type === "customers"
          ? db
              .prepare(
                "SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status='confirmed' THEN total_amount ELSE 0 END),0) AS total FROM orders WHERE customer_id=?",
              )
              .get(contact.id)
          : null;
      res.render("contact-detail", {
        title: contact.name,
        active: type,
        type,
        contact,
        history,
        associated,
        summary,
      });
    });
    app.get(`/${type}/:id/edit`, role, (req, res) => {
      const contact = db
        .prepare(`SELECT * FROM ${type} WHERE id=?`)
        .get(req.params.id);
      if (!contact)
        return res.status(404).render("error", {
          title: "Contact not found",
          message: "This contact does not exist.",
        });
      res.render("contact-form", {
        title: `Edit ${type.slice(0, -1)}`,
        active: type,
        type,
        contact,
        products: db.prepare("SELECT * FROM products ORDER BY name").all(),
        selectedProducts:
          type === "suppliers"
            ? db
                .prepare(
                  "SELECT product_id FROM product_suppliers WHERE supplier_id=?",
                )
                .all(contact.id)
                .map((r) => r.product_id)
            : [],
      });
    });
    app.post(
      `/${type}/:id`,
      role,
      action((req, res) => {
        const id = saveContact(db, type, req.body, req.user, req.params.id);
        redirect(res, `/${type}/${id}`, "Contact updated.");
      }, `/${type}`),
    );
  }

  app.get("/purchases", auth.requireManager, (req, res) => {
    const clauses = ["1=1"];
    const params = [];
    if (req.query.q) {
      clauses.push("(s.name LIKE ? OR CAST(po.id AS TEXT) LIKE ?)");
      params.push(`%${String(req.query.q)}%`, `%${String(req.query.q)}%`);
    }
    if (["pending", "received", "cancelled"].includes(req.query.status)) {
      clauses.push("po.status=?");
      params.push(req.query.status);
    }
    q.dateFilter(req.query, "po.created_at", clauses, params);
    const result = q.pageQuery(
      db,
      "po.*, s.name AS supplier_name",
      "FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id",
      clauses.join(" AND "),
      params,
      "po.created_at DESC, po.id DESC",
      req.query,
    );
    res.render("purchases", {
      title: "Purchase orders",
      active: "purchases",
      result,
    });
  });
  app.get("/purchases/new", auth.requireManager, (req, res) =>
    res.render("purchase-form", {
      title: "Create purchase order",
      active: "purchases",
      ...lookups(),
      associations: db.prepare("SELECT * FROM product_suppliers").all(),
    }),
  );
  app.post(
    "/purchases",
    auth.requireManager,
    action((req, res) => {
      const id = createPurchaseOrder(
        db,
        { ...req.body, items: itemsFromBody(req.body) },
        req.user,
      );
      res.redirect(`/purchases/${id}`);
    }, "/purchases/new"),
  );
  app.get("/purchases/:id", auth.requireManager, (req, res) => {
    const purchase = db
      .prepare(
        "SELECT po.*, s.name AS supplier_name, s.email, s.contact_name FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.id=?",
      )
      .get(req.params.id);
    if (!purchase)
      return res.status(404).render("error", {
        title: "Purchase order not found",
        message: "This purchase order does not exist.",
      });
    const items = db
      .prepare(
        "SELECT poi.*, p.name, p.sku, p.category FROM purchase_order_items poi JOIN products p ON p.id=poi.product_id WHERE poi.purchase_order_id=?",
      )
      .all(purchase.id);
    res.render("purchase", {
      title: `Purchase order #${String(purchase.id).padStart(4, "0")}`,
      active: "purchases",
      purchase,
      items,
    });
  });
  app.post(
    "/purchases/:id/:action",
    auth.requireManager,
    action((req, res) => {
      const statuses = { receive: "received", cancel: "cancelled" };
      transitionPurchaseOrder(
        db,
        req.params.id,
        statuses[req.params.action],
        req.user,
      );
      redirect(
        res,
        `/purchases/${Number(req.params.id)}`,
        req.params.action === "receive"
          ? "Goods received and inventory updated."
          : "Purchase order cancelled.",
      );
    }, "/purchases"),
  );

  const sendCSV = (res, filename, rows, columns) =>
    res.type("text/csv").attachment(filename).send(q.csv(rows, columns));
  app.get("/export/inventory", (req, res) => {
    const filter = q.productFilter(req.query);
    const rows = db
      .prepare(
        `SELECT p.* FROM products p WHERE ${filter.where} ORDER BY p.name`,
      )
      .all(...filter.params);
    audit(
      db,
      req.user,
      "export.inventory",
      "export",
      null,
      `${rows.length} products`,
    );
    sendCSV(res, "inventory.csv", rows, [
      ["SKU", "sku"],
      ["Product", "name"],
      ["Category", "category"],
      ["Unit price", "unit_price"],
      ["Stock", "stock_quantity"],
      ["Reorder level", "reorder_level"],
      [
        "Stock value",
        (r) => Math.round(r.unit_price * r.stock_quantity * 100) / 100,
      ],
      ["Status", (r) => ui.statusLabel(ui.status(r))],
    ]);
  });
  app.get("/export/orders", (req, res) => {
    const filter = q.orderFilter(req.query);
    const rows = db
      .prepare(
        `SELECT o.* FROM orders o WHERE ${filter.where} ORDER BY o.created_at DESC, o.id DESC`,
      )
      .all(...filter.params);
    audit(
      db,
      req.user,
      "export.orders",
      "export",
      null,
      `${rows.length} orders`,
    );
    sendCSV(res, "orders.csv", rows, [
      ["Order", "id"],
      ["Customer", "customer_name"],
      ["Status", "status"],
      ["Total", "total_amount"],
      ["Created (UTC)", "created_at"],
      ["Cancelled (UTC)", "cancelled_at"],
    ]);
  });
  app.get("/reports", auth.requireManager, (req, res) => {
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const from = req.query.from || to.slice(0, 8) + "01";
    const report = q.report(db, { from, to });
    res.render("reports", {
      title: "Reports",
      active: "reports",
      report,
      from,
      to,
    });
  });
  app.get("/export/report", auth.requireManager, (req, res) => {
    const data = q.report(db, req.query);
    audit(db, req.user, "export.report", "export", null, {
      from: req.query.from,
      to: req.query.to,
      type: req.query.type,
    });
    if (req.query.type === "sales")
      return sendCSV(res, "sales-report.csv", data.daily, [
        ["Date (UTC)", "day"],
        ["Confirmed orders", "orders"],
        ["Revenue", "revenue"],
      ]);
    sendCSV(res, "inventory-report.csv", data.inventory, [
      ["SKU", "sku"],
      ["Product", "name"],
      ["Opening quantity", "opening"],
      ["Increases", "increases"],
      ["Decreases", "decreases"],
      ["Closing quantity", "closing"],
      [
        "Closing value at current price",
        (r) => Math.round(r.closing * r.unit_price * 100) / 100,
      ],
    ]);
  });
  app.get("/audit", auth.requireManager, (req, res) => {
    const clauses = ["1=1"];
    const params = [];
    if (req.query.q) {
      clauses.push(
        "(a.actor_name LIKE ? OR a.action LIKE ? OR a.details LIKE ?)",
      );
      const match = `%${String(req.query.q).slice(0, 160)}%`;
      params.push(match, match, match);
    }
    q.dateFilter(req.query, "a.created_at", clauses, params);
    const result = q.pageQuery(
      db,
      "a.*",
      "FROM audit_logs a",
      clauses.join(" AND "),
      params,
      "a.created_at DESC, a.id DESC",
      req.query,
    );
    res.render("audit", { title: "Audit log", active: "audit", result });
  });
  app.get("/settings", (req, res) =>
    res.render("settings", {
      title: "Settings",
      active: "settings",
      users:
        req.user.role === "manager"
          ? db
              .prepare(
                "SELECT id,name,email,role,active,created_at FROM users ORDER BY id",
              )
              .all()
          : [],
      counts: {
        products: db.prepare("SELECT COUNT(*) AS n FROM products").get().n,
        orders: db.prepare("SELECT COUNT(*) AS n FROM orders").get().n,
      },
    }),
  );
  app.post(
    "/settings/users",
    auth.requireManager,
    action((req, res) => {
      auth.createUser(db, req.body, req.user);
      redirect(res, "/settings", "Team member added.");
    }, "/settings"),
  );
  app.post(
    "/settings/users/:id",
    auth.requireManager,
    action((req, res) => {
      auth.updateUserAccess(db, req.params.id, req.body, req.user);
      redirect(
        res,
        "/settings",
        "Access updated. Existing sessions for that account were revoked.",
      );
    }, "/settings"),
  );
  app.post(
    "/account/password",
    action((req, res) => {
      const user = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(req.user.id);
      if (!auth.verifyPassword(req.body.currentPassword, user.password_hash))
        throw new Error("Current password is incorrect.");
      const hash = auth.hashPassword(req.body.password);
      db.transaction(() => {
        db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
          hash,
          user.id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
        audit(db, req.user, "user.password_changed", "user", user.id);
      }).immediate();
      auth.endSession(db, req, res);
      res.redirect("/login");
    }, "/settings"),
  );
  app.get("/backup", auth.requireManager, (req, res) =>
    res.render("backup", { title: "Backup & restore", active: "backup" }),
  );
  app.get("/backup/download", auth.requireManager, (req, res) => {
    audit(db, req.user, "backup.created", "database", null);
    res
      .type("application/json")
      .attachment(`stockpilot-${new Date().toISOString().slice(0, 10)}.json`)
      .send(exportBackup(db));
  });
  app.post(
    "/backup/restore",
    auth.requireManager,
    action((req, res) => {
      if (req.body.restoreConfirm !== "RESTORE")
        throw new Error("Type RESTORE to confirm replacing the database.");
      if (
        typeof req.body.backup !== "string" ||
        req.body.backup.length > 7000000
      )
        throw new Error("Choose a backup smaller than 7 MB.");
      restoreBackup(db, req.body.backup, req.user, {
        safetyDirectory:
          db.name === ":memory:"
            ? undefined
            : path.join(path.dirname(db.name), "backups"),
      });
      auth.endSession(db, req, res);
      res.redirect("/login");
    }, "/backup"),
  );
  app.get("/search", (req, res) => {
    const term = String(req.query.q || "")
      .trim()
      .slice(0, 160);
    const match = `%${term}%`;
    const products = term
      ? db
          .prepare(
            "SELECT * FROM products WHERE name LIKE ? OR sku LIKE ? ORDER BY active DESC, name LIMIT 10",
          )
          .all(match, match)
      : [];
    const orders = term
      ? db
          .prepare(
            "SELECT * FROM orders WHERE customer_name LIKE ? OR CAST(id AS TEXT) LIKE ? ORDER BY id DESC LIMIT 10",
          )
          .all(match, match)
      : [];
    const customers = term
      ? db
          .prepare(
            "SELECT * FROM customers WHERE name LIKE ? OR email LIKE ? LIMIT 10",
          )
          .all(match, match)
      : [];
    const suppliers =
      term && req.user.role === "manager"
        ? db
            .prepare(
              "SELECT * FROM suppliers WHERE name LIKE ? OR email LIKE ? LIMIT 10",
            )
            .all(match, match)
        : [];
    res.render("search", {
      title: "Search",
      active: "",
      term,
      products,
      orders,
      customers,
      suppliers,
    });
  });
  app.use((req, res) =>
    res.status(404).render("error", {
      title: "Page not found",
      message: "The page you are looking for does not exist.",
    }),
  );
  app.use((error, req, res, next) => {
    const status = error.status || (error instanceof URIError ? 400 : 500);
    if (status >= 500) console.error(error);
    res.status(status).render("error", {
      title:
        status === 400
          ? "Unable to complete action"
          : status === 413
            ? "File too large"
            : "Something went wrong",
      message:
        status >= 500
          ? "Please try again. Your inventory changes were not partially saved."
          : error.message,
      returnPath: error.returnPath || "/",
    });
  });
  return app;
}
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`StockPilot running at http://localhost:${port}`),
  );
}
module.exports = { createApp };
