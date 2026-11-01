function audit(db, actor, action, entityType, entityId, details = "") {
  db.prepare(
    "INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    actor?.id || null,
    actor?.name || "System",
    action,
    entityType,
    entityId || null,
    typeof details === "string" ? details : JSON.stringify(details),
  );
}
module.exports = { audit };
