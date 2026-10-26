# Inventory & Order Management System

A minimal web application for managing products, inventory levels, and customer orders.

## Local setup

```sh
npm install
npm start
```

Open `http://localhost:3000`. The application stores its local SQLite database in `data/inventory.db` and seeds a few sample products the first time it starts.

## Current scope

The first usable workflow is: view inventory, create an order, validate stock, and update inventory when the order is confirmed. Authentication, payments, supplier integrations, and multi-warehouse support are deliberately out of scope for the initial evaluation release.
