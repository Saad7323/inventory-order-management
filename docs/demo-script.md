# Demonstration Script

## Prepare

Use Node.js 24+, run `npm ci`, then `npm start`. On a fresh database, create a manager account at http://localhost:3000. Do not delete an existing database to reset a demo; use the backup workflow or set a separate `DATABASE_PATH`. The sample catalogue has products at healthy, low, and zero stock. Sales start empty.

## Suggested 7-minute walkthrough

| Time      | Show                    | Explain                                                                                                                                                                     |
| --------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:45 | Inventory               | Summary values, actual value history, status distribution, restock list, and responsive navy-sidebar design.                                                                |
| 0:45–1:25 | Filters and pagination  | Combine category, status, supplier, and price filters. Change page size. Export all matching inventory rows.                                                                |
| 1:25–2:10 | Customers and sales     | Create a customer contact and a multi-line order. Show the captured total, reduced stock, customer history, and stock movements.                                            |
| 2:10–2:45 | Cancellation            | Cancel the confirmed order and show restored stock. The cancellation action disappears because it cannot run twice.                                                         |
| 2:45–3:35 | Suppliers and purchases | Open the sample supplier, review associations, create a purchase order, and receive goods. Show the referenced positive stock movement.                                     |
| 3:35–4:20 | Overview and Reports    | Select dates, review confirmed revenue/order statistics, generate inventory/sales reports, and download CSV. Explain current-price valuation.                               |
| 4:20–5:10 | Settings and roles      | Create a staff account. In a separate browser session, sign in as staff and show permitted sales/customer pages and a denied manager route.                                 |
| 5:10–5:50 | Audit and backups       | Show action/actor history. Download a backup and explain validated atomic restore, safety copies, and session revocation. Restore only on a demo database.                  |
| 5:50–7:00 | Tests and architecture  | Run `npm run test:all` with Google Chrome installed. Show actual results. Explain immediate SQLite transactions, scrypt, server permission checks, and the movement ledger. |

## Evidence

Capture actual test output from the final code version. Browser tests save desktop inventory, sales overview, and mobile screenshots under `output/screenshots/`. Do not claim external deployment, accounting-grade historical valuation, partial receiving, payments, or multi-warehouse support.

The original midsemester report/PDF remains a historical artifact; README, architecture, use-case map, and this script describe the expanded application.
