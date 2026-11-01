const crypto = require("node:crypto");
const v = require("./validation");
const { audit } = require("./audit");
const COOKIE = "stockpilot_session";
const SESSION_AGE = 8 * 60 * 60 * 1000;
const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  )
    throw new Error("Use a password between 10 and 128 characters.");
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
const dummyHash = hashPassword(crypto.randomBytes(24).toString("hex"));
function verifyPassword(password, stored = dummyHash) {
  if (typeof password !== "string" || password.length > 128) return false;
  const [algorithm, salt, expected] = stored.split(":");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(expected)
  )
    return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    crypto.scryptSync(password, salt, 64),
  );
}
function createUser(db, body, actor) {
  const name = v.text(body.name, "Name");
  const email = v.contact({ ...body, name }).email.toLowerCase();
  if (!email) throw new Error("Email is required.");
  if (!["manager", "staff"].includes(body.role))
    throw new Error("Choose manager or staff.");
  const password = hashPassword(body.password);
  try {
    return db
      .transaction(() => {
        const id = db
          .prepare(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
          )
          .run(name, email, password, body.role).lastInsertRowid;
        audit(db, actor || { id, name }, "user.created", "user", id, {
          email,
          role: body.role,
        });
        return id;
      })
      .immediate();
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE")
      throw new Error("An account with that email already exists.");
    throw error;
  }
}
function updateUserAccess(db, id, body, actor) {
  const userId = v.integer(id, "User");
  const active = body.active === "1" ? 1 : 0;
  if (!["manager", "staff"].includes(body.role))
    throw new Error("Choose manager or staff.");
  db.transaction(() => {
    const before = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!before) throw new Error("User not found.");
    if (before.id === actor.id && (!active || body.role !== "manager"))
      throw new Error("You cannot remove your own manager access.");
    if (
      before.role === "manager" &&
      before.active &&
      (!active || body.role !== "manager") &&
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'manager' AND active = 1",
        )
        .get().count <= 1
    )
      throw new Error("At least one active manager is required.");
    db.prepare("UPDATE users SET active = ?, role = ? WHERE id = ?").run(
      active,
      body.role,
      userId,
    );
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    audit(db, actor, "user.access_changed", "user", userId, {
      active,
      role: body.role,
    });
  }).immediate();
}
function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => {
        const index = part.indexOf("=");
        return index < 0
          ? ["", ""]
          : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
      }),
  );
}
function cookieOptions(req) {
  return { httpOnly: true, sameSite: "lax", secure: req.secure, path: "/" };
}
function startSession(db, req, res, userId) {
  const raw = crypto.randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)",
  ).run(
    hashToken(raw),
    userId,
    crypto.randomBytes(32).toString("hex"),
    Date.now() + SESSION_AGE,
  );
  res.cookie(COOKIE, raw, { ...cookieOptions(req), maxAge: SESSION_AGE });
}
function authContext(db) {
  return (req, res, next) => {
    const parsed = cookies(req);
    const raw = parsed[COOKIE];
    const session =
      raw && /^[a-f0-9]{64}$/.test(raw)
        ? db
            .prepare(
              "SELECT s.*, u.name, u.email, u.role, u.active FROM sessions s JOIN users u ON u.id = s.user_id WHERE token_hash = ? AND expires_at > ? AND u.active = 1",
            )
            .get(hashToken(raw), Date.now())
        : null;
    req.user = session
      ? {
          id: session.user_id,
          name: session.name,
          email: session.email,
          role: session.role,
        }
      : null;
    req.sessionHash = session?.token_hash;
    let csrf = session?.csrf_token || parsed.stockpilot_csrf;
    if (!csrf || !/^[a-f0-9]{64}$/.test(csrf)) {
      csrf = crypto.randomBytes(32).toString("hex");
      res.cookie("stockpilot_csrf", csrf, cookieOptions(req));
    }
    res.locals.user = req.user;
    res.locals.csrfToken = csrf;
    if (req.method === "POST") {
      const supplied = String(req.body?._csrf || req.get("x-csrf-token") || "");
      if (
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(csrf))
      )
        return res
          .status(403)
          .render("error", {
            title: "Form expired",
            message: "Refresh this page and submit the form again.",
          });
    }
    next();
  };
}
function requireAuth(req, res, next) {
  if (!req.user) return res.redirect("/login");
  next();
}
function requireManager(req, res, next) {
  if (req.user?.role !== "manager")
    return res
      .status(403)
      .render("error", {
        title: "Manager access required",
        message:
          "Your staff account does not have permission to use this page or action.",
      });
  next();
}
function endSession(db, req, res) {
  if (req.sessionHash)
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
      req.sessionHash,
    );
  res.clearCookie(COOKIE, cookieOptions(req));
}
module.exports = {
  hashPassword,
  verifyPassword,
  createUser,
  updateUserAccess,
  startSession,
  endSession,
  authContext,
  requireAuth,
  requireManager,
};
