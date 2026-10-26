# Inventory & Order Management System — Mid-Semester Report

## 1. Problem statement

Small businesses often track stock and customer orders manually, which makes it easy to sell unavailable items, miss low-stock products, and lose the reason for inventory changes. This project provides a focused web application that keeps a product catalogue, records stock levels, confirms customer orders only when inventory is available, and stores an audit trail of stock movements.

## 2. Scope

### In scope

- Create products with SKU, price, opening quantity, and reorder level.
- View current inventory and low-stock status.
- Restock products and record the movement.
- Create confirmed orders with one or more product lines.
- Reject orders that exceed available inventory.
- View confirmed orders and their line items.

### Out of scope for this release

- Login and role-based permissions.
- Payments, invoicing, and delivery tracking.
- Suppliers, purchase orders, and multiple warehouses.
- Barcode scanning and external integrations.

## 3. Stakeholders

| Stakeholder | Need from the system |
|---|---|
| Inventory manager | Accurate stock visibility and low-stock warnings. |
| Order-processing staff | A simple way to confirm orders without overselling stock. |
| Business owner/administrator | Product, order, and inventory-movement records. |
| Customer | Indirect benefit: orders are accepted only when items are available. |
| Course evaluator | Traceable requirements, working feature, tests, and design evidence. |

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Staff can create a product with a unique SKU, price, stock quantity, and reorder level. | Must |
| FR-02 | Staff can view active products and their current stock levels. | Must |
| FR-03 | The system marks products at or below their reorder level as low stock. | Must |
| FR-04 | Staff can restock a product and the system records the stock movement. | Must |
| FR-05 | Staff can create an order with one or more product lines. | Must |
| FR-06 | The system rejects an order if the combined requested quantity exceeds available stock. | Must |
| FR-07 | Confirming an order deducts stock and records order items and stock movements. | Must |
| FR-08 | Staff can view the order list and an individual order’s details. | Should |

## 5. Non-functional requirements

- **Data integrity:** Stock-changing actions run in a database transaction.
- **Validation:** Invalid quantities, missing names, duplicate SKUs, and unavailable stock receive clear feedback.
- **Usability:** The primary flows are accessible from a small number of server-rendered screens.
- **Maintainability:** Database, inventory, order, web-server, and test concerns are separated into modules.
- **Portability:** The application runs locally with Node.js and a file-based SQLite database.

## 6. Actual test evidence

Run `npm test` from the repository root. The current suite contains seven passing automated tests covering product creation, restocking, order confirmation, insufficient stock, duplicate lines, successful web-order submission, and the web error path for unavailable stock. Test output must be re-run and attached/screenshot before final submission.

## 7. Demonstration flow

1. Open the dashboard and point out current inventory and a low-stock item.
2. Add a product or restock an existing product.
3. Create a multi-line order.
4. Open its confirmation page and show the changed stock quantity.
5. Attempt an oversized order and show the validation message.
6. Open order history and explain the automated tests.
