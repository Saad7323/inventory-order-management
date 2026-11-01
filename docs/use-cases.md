# Feature and Use-Case Map

The initial evaluation scope has been extended to the following working workflows.

| Feature                                      | Primary route                              | Actor           |
| -------------------------------------------- | ------------------------------------------ | --------------- |
| Stock movement history                       | `/movements`                               | Staff / manager |
| Low-stock and zero-stock alerts              | `/`                                        | Staff / manager |
| Sales analytics and order statistics         | `/dashboard`                               | Manager         |
| Inventory and sales date-range reports       | `/reports`                                 | Manager         |
| Filtered inventory and order CSV             | `/export/inventory`, `/export/orders`      | Staff / manager |
| Transactional order cancellation             | `/orders/:id`                              | Manager         |
| Customer details and history                 | `/customers`                               | Staff / manager |
| Supplier contacts and product associations   | `/suppliers`                               | Manager         |
| Purchase creation / receiving / cancellation | `/purchases`                               | Manager         |
| First-run setup and login                    | `/setup`, `/login`                         | Account holder  |
| Account roles / session revocation           | `/settings`                                | Manager         |
| Combined search and filters                  | Inventory, sales, movements, global search | As permitted    |
| Pagination                                   | List screens                               | As permitted    |
| Complete database backup / restore           | `/backup`                                  | Manager         |
| Important action history                     | `/audit`                                   | Manager         |

## Confirm a sale

Choose an existing customer or enter a new name. Add one or more products and quantities. The server combines duplicate product lines, rechecks available stock, captures prices, creates the order/items, deducts stock, and records movements and an audit event. A failure rolls back the customer creation and all order/stock writes.

## Cancel a sale

A manager opens a confirmed order and selects **Cancel & restore stock**. The order state, all restored quantities, movements, and audit event are committed together. Repeated cancellation is rejected. Discontinued product quantities are also restored, preserving the ledger.

## Receive a supplier delivery

A manager creates a supplier profile and associates products. A purchase order contains associated active products, quantities, and unit costs. Creation leaves on-hand stock unchanged. **Receive goods** adds every ordered quantity, writes movement references, and marks the purchase received in one transaction. A pending purchase can instead be cancelled. Completed purchases cannot be received again.

## Review a reporting period

Select inclusive start and end dates on Overview or Reports. Review confirmed sales, total/cancelled orders, average order value, and product performance. The inventory report shows opening quantity, increases, decreases, and closing quantity for all products. CSV and browser-print options produce shareable reports. Dates use UTC; inventory values use current catalogue prices.

## Manage access

A manager creates individual staff or manager accounts. Staff can process sales and customer records while restricted management routes return 403. Access changes and account disabling revoke sessions. The current manager cannot remove their own manager access. Users can change their own password.

## Recover a workspace

Download a complete backup. To restore, select the file and type `RESTORE`. The server validates the snapshot in an isolated database, saves a pre-restore safety copy, and atomically replaces data. Successful restore signs out all sessions. Invalid backups leave live data untouched.
