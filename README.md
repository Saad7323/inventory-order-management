# StockPilot — Inventory & Order Management

A local inventory workspace built with Express 5, EJS, and SQLite. The interface uses a navy sidebar, inventory summary cards, real-data charts, stock alerts, and searchable tables inspired by the supplied design reference.

## Run locally

Use **Node.js 24 or newer**.

```sh
npm ci
npm start
```

Open **http://localhost:3000**. On first run, create your manager account. There are no default credentials. New databases include 12 clearly named sample products and one sample supplier; no sales or user accounts are fabricated. Existing databases are migrated in place without replacing products or orders.

The database is created automatically at `data/inventory.db`. Keep this file and its WAL files together while the app runs; use the application's backup workflow for portable copies.

```sh
npm run dev       # Restart the server when source files change
npm test          # Service and HTTP integration tests
npm run test:e2e  # Browser workflows; uses an installed Google Chrome
npm run test:all  # Both suites
```

Browser tests use an isolated temporary database on port 3101. They do not touch your workspace data. Screenshots are generated under `output/screenshots/`. Install Google Chrome to use the included Playwright configuration, or change `channel: 'chrome'` in `playwright.config.js` to a browser available on your machine.

## Included workflows

| Feature                     | Where to use it                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Stock movement history      | Stock movements: signed adjustments, opening balances, sales, cancellations, and purchases, with dates and references |
| Low-stock alerts            | Inventory summary cards, status tabs, notification link, and restock list; zero stock is distinguished from low stock |
| Sales analytics             | Overview: confirmed sales totals, order counts, average order value, top products, and sales history for a date range |
| Inventory and sales reports | Reports: inclusive date range, daily sales, opening/closing inventory, quantities in/out, CSV, and browser printing   |
| CSV exports                 | Inventory and Sales orders; exports include all filtered matches across all pages                                     |
| Safe order cancellation     | Order detail: managers can cancel confirmed orders once and restore every line atomically                             |
| Customers                   | Create/edit contact details, view linked orders and lifetime confirmed sales                                          |
| Suppliers                   | Create/edit supplier contacts and associate products                                                                  |
| Purchase orders             | Create multi-line supplier orders, receive all goods once, or cancel pending orders                                   |
| Authentication              | First-run manager setup, password sign-in, logout, password changes, and expiring sessions                            |
| Manager/staff permissions   | Settings: create team accounts, change roles, disable accounts, and revoke their sessions                             |
| Advanced filters            | Product category, supplier, stock status, price range, sort; order status, customer, date, amount, and sort           |
| Pagination                  | Inventory, orders, movements, customers, suppliers, purchase orders, and audit log; 10/25/50 rows per page            |
| Backup and restore          | Manager-only complete JSON backups, checksum/schema/reference validation, safety backups, and atomic restore          |
| Audit log                   | Read-only history of important stock, order, contact, account, export, backup, and authentication actions             |

## Permissions

**Staff** can view inventory and movements, search the workspace, manage customers, create/view sales orders, export inventory and orders, and change their own password.

**Managers** can also manage products, adjust stock, cancel orders, manage suppliers and purchase orders, view analytics/reports/audit logs, create or disable team accounts, and back up or restore the database. Every permission is enforced on server routes. A manager cannot remove their own manager access.

## Data rules

- Each stock change and its movement record are committed together. Failed multi-line sales, cancellations, and receipts roll back completely.
- Duplicate sales lines are combined before stock checks. Duplicate purchase lines must be combined by the user.
- Only confirmed sales orders can be cancelled. Only pending purchase orders can be received or cancelled. Neither action can restore/add stock twice.
- Purchase products must be associated with their supplier. Receiving is for the entire purchase; partial receipts are not supported.
- Order prices are captured at confirmation. Sales totals exclude orders currently cancelled, even when reporting their original order date.
- Date filters are inclusive and use UTC. Chart days use UTC. Inventory value history uses reconstructed quantities **at current product prices**, not historical accounting valuations.
- Discontinued products remain in historical orders, movements, and reports. They cannot be sold on new orders.
- CSV text is quoted and formula-like cells are escaped for spreadsheet safety.

## Backup and recovery

Use **Backup & restore → Download database backup**. The JSON file includes password hashes and contact data, so store it privately. Sessions are intentionally excluded.

To restore, select a StockPilot backup, type `RESTORE`, and submit. Validation occurs in an isolated database first. Invalid files leave current data unchanged. A pre-restore safety copy is saved to `data/backups/` before the atomic replacement. A successful restore signs out everyone; sign in with an account contained in the restored backup. Safety copies can be restored through the same screen. Backups are limited to 7 MB through the web form.

## Configuration

| Environment variable | Default             | Purpose                                                                        |
| -------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `HOST`               | `127.0.0.1`         | Bind address; local access by default                                          |
| `PORT`               | `3000`              | HTTP listener port                                                             |
| `DATABASE_PATH`      | `data/inventory.db` | SQLite file; parent directories are created automatically                      |
| `TRUST_PROXY`        | unset               | Set to `1` only behind a trusted reverse proxy to support HTTPS secure cookies |

Passwords use salted scrypt hashes. Sessions use hashed random tokens, expire after eight hours, and have HttpOnly/SameSite cookies. State-changing forms require CSRF tokens. Sign-in attempts are rate limited. The app serves its own scripts, icons, and styles; no external chart or font services are required.

This is a single-workspace application. Payments, tax, delivery tracking, partial purchase receiving, multiple warehouses, and automatic remote backups are not included.

See [architecture](docs/architecture.md), [feature/use-case map](docs/use-cases.md), and the [demo script](docs/demo-script.md). The older midsemester report and PDF are retained as historical evaluation artifacts.
