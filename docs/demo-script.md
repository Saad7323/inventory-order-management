# 5-7 Minute Demonstration Script

## Before recording

- Run `npm install` once, then `npm start`.
- Open `http://localhost:3000` in a browser.
- Keep the terminal and the test command ready, but do not claim a test result you have not just run.
- Use the seeded products or add your own realistic sample products.

## Script

| Time | Show | Narration prompt |
|---|---|---|
| 0:00-0:35 | Dashboard | “This Inventory and Order Management System helps staff prevent overselling and track stock changes.” |
| 0:35-1:15 | Inventory table | “The dashboard shows SKU, price, quantity, and low-stock status. USB-C Hub is marked low stock because it is at or below its reorder level.” |
| 1:15-1:50 | Add product | “An inventory manager can add a new product with a unique SKU, opening stock, and reorder threshold.” |
| 1:50-2:25 | Restock | “Restocking changes the quantity through a dedicated action, which records an audit movement rather than silently editing stock.” |
| 2:25-3:35 | Multi-line order | “Order staff enter a customer, select one or more products, and confirm the order. The system checks combined requested quantities before it saves anything.” |
| 3:35-4:10 | Confirmation and inventory | “The confirmation page shows the completed order; returning to inventory shows the reduced stock.” |
| 4:10-4:40 | Insufficient-stock attempt | “An oversized quantity produces a clear error and does not create a partial order or change inventory.” |
| 4:40-5:15 | Order history and search | “Staff can find orders by customer or number, and products by SKU or name. Products can also be edited or deactivated.” |
| 5:15-6:00 | Architecture and tests | “The Express app uses SQLite. Order confirmation is transactional, and the test suite verifies product, stock, order, error, and web-flow cases.” |
| 6:00-6:30 | Close | “The current scope focuses on reliable inventory and ordering. Payments, supplier integrations, and authentication are listed as future work.” |

## Recording checklist

- [ ] Keep the video between five and seven minutes.
- [ ] Ensure text is legible at the recording resolution.
- [ ] Show the order confirmation and changed inventory quantity.
- [ ] Show actual `npm test` output from the final code snapshot.
- [ ] Do not show personal API keys, account information, or unrelated browser tabs.
