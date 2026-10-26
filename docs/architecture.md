# Architecture and Database Design

## Application architecture

```mermaid
flowchart LR
  User[Inventory staff] --> UI[Express + EJS web interface]
  UI --> Orders[Order service]
  UI --> Inventory[Inventory service]
  Orders --> DB[(SQLite database)]
  Inventory --> DB
  UI --> DB
```

The Express server serves HTML views and accepts form submissions. The `orders` service owns transactional order confirmation; the `inventory` service owns product creation and restocking. SQLite is used because it is a persistent local database without an additional server to install.

## Entity relationships

```mermaid
erDiagram
  PRODUCTS ||--o{ ORDER_ITEMS : appears_in
  ORDERS ||--|{ ORDER_ITEMS : contains
  PRODUCTS ||--o{ STOCK_MOVEMENTS : changes
  ORDERS o|--o{ STOCK_MOVEMENTS : causes

  PRODUCTS {
    integer id PK
    string sku UK
    string name
    decimal unit_price
    integer stock_quantity
    integer reorder_level
    boolean active
  }
  ORDERS {
    integer id PK
    string customer_name
    string status
    decimal total_amount
    datetime created_at
  }
  ORDER_ITEMS {
    integer id PK
    integer order_id FK
    integer product_id FK
    integer quantity
    decimal unit_price
  }
  STOCK_MOVEMENTS {
    integer id PK
    integer product_id FK
    integer order_id FK
    integer change_quantity
    string reason
    datetime created_at
  }
```

## Integrity decisions

- Foreign keys are enabled for every database connection.
- Product SKUs are unique.
- Prices and stock quantities cannot be negative.
- Order confirmation aggregates duplicate product lines before validating stock.
- An order, its items, inventory deductions, and negative stock movements are written as one transaction; a failed validation leaves the database unchanged.
