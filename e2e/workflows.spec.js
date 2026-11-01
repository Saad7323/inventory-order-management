const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const screenshots = path.join(__dirname, "..", "output", "screenshots");
test.describe.configure({ mode: "serial" });
const manager = {
  name: "Alex Morgan",
  email: "alex@example.test",
  password: "browser-manager-123",
};
async function signIn(
  page,
  email = manager.email,
  password = manager.password,
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.getByRole("heading", { name: "Inventory." })).toBeVisible();
}

test("first-run setup, inventory controls and navigation render without browser errors", async ({
  page,
}) => {
  fs.mkdirSync(screenshots, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make room for better inventory." }),
  ).toBeVisible();
  await page.getByLabel("Your name").fill(manager.name);
  await page.getByLabel("Email address").fill(manager.email);
  await page.getByLabel("Password", { exact: true }).fill(manager.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Inventory." })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "inventory-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Accessories");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.locator("tbody")).toContainText("USB-C Hub");
  await expect(page.locator("tbody")).not.toContainText("Ergonomic Chair");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Adjust stock for Braided USB-C Cable" })
    .click();
  await page.getByLabel("Quantity change").fill("3");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Browser test delivery");
  await page
    .getByRole("button", { name: "Record adjustment", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Stock adjusted");
  await expect(page.locator("tbody")).toContainText("Browser test delivery");
  for (const [url, name] of [
    ["/dashboard", "Business overview."],
    ["/customers", "Customers."],
    ["/suppliers", "Suppliers."],
    ["/reports", "Reports."],
    ["/audit", "Audit log."],
    ["/settings", "Settings."],
    ["/backup", "Backup & restore."],
  ]) {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("customer management, multi-line order and cancellation update history and analytics", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/customers/new");
  await page.getByLabel("Full name").fill("Jordan Lee");
  await page.getByLabel("Email address").fill("jordan@example.test");
  await page.getByLabel("Phone number").fill("+1 555 0200");
  await page.getByLabel("Address", { exact: true }).fill("12 Park Road");
  await page
    .getByRole("button", { name: "Save customer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jordan Lee." }),
  ).toBeVisible();
  await page.goto("/orders/new");
  await page
    .getByRole("combobox", { name: "Customer", exact: true })
    .selectOption({ label: "Jordan Lee · jordan@example.test" });
  await page
    .getByRole("combobox", { name: "Product", exact: true })
    .selectOption({ label: "Wireless Keyboard · 15 in stock · $49.99" });
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add another item" }).click();
  await page
    .getByRole("combobox", { name: "Product", exact: true })
    .nth(1)
    .selectOption({ label: "Optical Mouse · 8 in stock · $24.99" });
  await expect(page.locator("[data-order-total]")).toHaveText("$124.97");
  await page.getByRole("button", { name: "Confirm order" }).click();
  await expect(page.getByRole("heading", { name: "#SO-0001." })).toBeVisible();
  await expect(page.locator(".summary-row.total")).toContainText("$124.97");
  await page.goto("/dashboard");
  await expect(page.locator(".stat-card").first()).toContainText("$124.97");
  await page.screenshot({
    path: path.join(screenshots, "sales-dashboard.png"),
    fullPage: true,
  });
  await page.goto("/orders/1");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel & restore stock" }).click();
  await expect(page.getByRole("status")).toContainText(
    "All stock has been restored",
  );
  await expect(
    page.getByRole("button", { name: "Cancel & restore stock" }),
  ).toHaveCount(0);
  await page.goto("/?q=KB-100");
  await expect(page.locator("tbody .stock-quantity")).toHaveText("15");
  await page.goto("/customers/1");
  await expect(page.locator("tbody")).toContainText("Cancelled");
});

test("supplier associations, purchase receiving, CSV downloads, backups and staff restrictions work", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.goto("/purchases/new");
  await page
    .getByRole("combobox", { name: "Supplier", exact: true })
    .selectOption({ label: "Northstar Supply Co." });
  await page
    .getByRole("combobox", { name: "Product", exact: true })
    .selectOption({ label: "USB-C Hub · HD-300" });
  await page.getByLabel("Quantity", { exact: true }).fill("10");
  await page.getByLabel("Unit cost ($)").fill("20");
  await expect(page.locator("[data-order-total]")).toHaveText("$200.00");
  await page
    .getByRole("button", { name: "Create purchase order", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "#PO-0001." })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Receive goods" }).click();
  await expect(page.getByRole("status")).toContainText("Goods received");
  await expect(page.getByRole("button", { name: "Receive goods" })).toHaveCount(
    0,
  );
  await page.goto("/?q=HD-300");
  await expect(page.locator("tbody .stock-quantity")).toHaveText("13");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("inventory.csv");
  await page.goto("/settings");
  const team = page.locator('form[action="/settings/users"]');
  await team.getByLabel("Full name").fill("Sam Staff");
  await team.getByLabel("Email address").fill("sam@example.test");
  await team.getByLabel("Initial password").fill("browser-staff-123");
  await team.getByRole("button", { name: "Add team member" }).click();
  const staff = await browser.newContext();
  const staffPage = await staff.newPage();
  await signIn(staffPage, "sam@example.test", "browser-staff-123");
  await expect(
    staffPage.getByRole("link", { name: "Add product", exact: true }),
  ).toHaveCount(0);
  const forbidden = await staffPage.goto("/backup");
  expect(forbidden.status()).toBe(403);
  await expect(
    staffPage.getByRole("heading", { name: "Manager access required." }),
  ).toBeVisible();
  await staff.close();
  await page.goto("/backup");
  const backupPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download database backup" }).click();
  const backup = await backupPromise;
  const backupPath = await backup.path();
  await page.getByLabel("Backup file").setInputFiles(backupPath);
  await expect(page.getByRole("status")).toContainText("Backup ready");
  await page.getByLabel("Type RESTORE to confirm").fill("RESTORE");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Restore database", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace" }),
  ).toBeVisible();
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Inventory." })).toBeVisible();
});

test("mobile layout, navigation, filters and forms remain usable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(screenshots, "inventory-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.locator(".sidebar")).toBeInViewport();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Sales orders", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sales orders." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Create order", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm order" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
