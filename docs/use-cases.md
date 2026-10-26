# Prioritised Backlog and Use Cases

## Backlog

| Priority | Backlog item | Status |
|---|---|---|
| Must | View inventory and low-stock state | Implemented |
| Must | Add a product | Implemented |
| Must | Restock a product with an audit entry | Implemented |
| Must | Confirm stock-validated multi-line orders | Implemented |
| Must | Preserve inventory changes atomically | Implemented |
| Should | View an order list and order details | Implemented |
| Could | Edit/deactivate products | Not started |
| Could | Filter/search inventory and orders | Not started |
| Could | Authentication and role-based access | Out of current scope |

## UC-01: Confirm customer order

**Primary actor:** Order-processing staff

**Preconditions:** Products exist with available stock.

**Main flow:**

1. Staff enters a customer name.
2. Staff selects one or more products and quantities.
3. Staff confirms the order.
4. The system combines duplicate product lines and checks stock availability.
5. The system creates the order and its items.
6. The system deducts inventory and creates negative stock-movement records.
7. The system displays the confirmation and total.

**Alternative flow:** If any requested quantity exceeds stock, the system shows an error and stores no order or inventory change.

## UC-02: Restock product

**Primary actor:** Inventory manager

**Preconditions:** The product exists and is active.

**Main flow:**

1. The manager enters a positive restock quantity beside a product.
2. The system increases its stock quantity.
3. The system records a positive `Stock restock` movement.

## UC-03: Add product

**Primary actor:** Inventory manager

**Main flow:**

1. The manager supplies a SKU, name, price, opening stock, and reorder level.
2. The system validates the values and SKU uniqueness.
3. The system saves the product and displays it in inventory.
