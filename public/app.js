"use strict";
document
  .querySelectorAll("[data-auto-submit]")
  .forEach((form) =>
    form.addEventListener("change", () => form.requestSubmit()),
  );
document.querySelectorAll("[data-toggle]").forEach((button) =>
  button.addEventListener("click", () => {
    const panel = document.getElementById(button.dataset.toggle);
    panel.classList.toggle("hidden");
    button.setAttribute(
      "aria-expanded",
      String(!panel.classList.contains("hidden")),
    );
  }),
);
document
  .querySelectorAll("[data-dismiss]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest(".notice").remove()),
  );
document.querySelectorAll("[data-toggle-menu]").forEach((button) =>
  button.addEventListener("click", () => {
    document.body.classList.toggle("menu-open");
    document
      .querySelector(".mobile-menu")
      ?.setAttribute(
        "aria-expanded",
        String(document.body.classList.contains("menu-open")),
      );
  }),
);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.getElementById("global-search")?.focus();
  }
  if (event.key === "Escape") {
    document.body.classList.remove("menu-open");
    document
      .querySelector(".mobile-menu")
      ?.setAttribute("aria-expanded", "false");
  }
});
document.querySelectorAll("[data-password-toggle]").forEach((button) =>
  button.addEventListener("click", () => {
    const field = document.getElementById(button.dataset.passwordToggle);
    field.type = field.type === "password" ? "text" : "password";
    button.textContent = field.type === "password" ? "Show" : "Hide";
    button.setAttribute("aria-label", `${button.textContent} password`);
  }),
);
document.querySelectorAll("form[data-confirm]").forEach((form) =>
  form.addEventListener("submit", (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  }),
);
document
  .querySelectorAll("[data-print]")
  .forEach((button) => button.addEventListener("click", () => window.print()));
const adjustDialog = document.getElementById("adjust-dialog");
document.querySelectorAll("[data-adjust-id]").forEach((button) =>
  button.addEventListener("click", () => {
    const form = document.getElementById("adjust-form");
    form.reset();
    form.action = `/products/${button.dataset.adjustId}/adjust`;
    document.getElementById("adjust-product-name").textContent =
      button.dataset.adjustName;
    adjustDialog.showModal();
  }),
);
document
  .querySelectorAll("[data-close-dialog]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
const customerSelect = document.getElementById("customer-select");
function syncCustomer() {
  if (!customerSelect) return;
  const field = document.getElementById("customer-name");
  field.required = !customerSelect.value;
  field.disabled = !!customerSelect.value;
  field.closest("label").classList.toggle("hidden", !!customerSelect.value);
}
customerSelect?.addEventListener("change", syncCustomer);
syncCustomer();
const lineForm = document.querySelector("[data-line-form]");
if (lineForm) {
  const list = lineForm.querySelector(".order-lines");
  const supplier = lineForm.querySelector("[name=supplierId]");
  const format = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  function syncProducts() {
    if (!supplier) return;
    list.querySelectorAll("[name=productId]").forEach((select) => {
      [...select.options].forEach((option) => {
        if (!option.value) return;
        const allowed = option.dataset.suppliers
          .split(",")
          .includes(supplier.value);
        option.hidden = !allowed;
        option.disabled = !allowed;
        if (!allowed && select.value === option.value) select.value = "";
      });
    });
  }
  function updateTotals() {
    let total = 0,
      count = 0;
    list.querySelectorAll(".order-line").forEach((line) => {
      const selected =
        line.querySelector("[name=productId]").selectedOptions[0];
      const quantity = Math.max(
        0,
        Number(line.querySelector("[name=quantity]").value) || 0,
      );
      const unitCost = line.querySelector("[name=unitCost]");
      const price = unitCost
        ? Number(unitCost.value) || 0
        : Number(selected?.dataset.price) || 0;
      const lineTotal = (Math.round(price * 100) * quantity) / 100;
      const output = line.querySelector("[data-line-total]");
      if (output) output.textContent = format(lineTotal);
      total += lineTotal;
      count += quantity;
      line.querySelector("[data-remove-line]").disabled =
        list.children.length === 1;
    });
    document
      .querySelectorAll("[data-order-total]")
      .forEach((el) => (el.textContent = format(total)));
    document
      .querySelectorAll("[data-order-units]")
      .forEach((el) => (el.textContent = count));
    document
      .querySelectorAll("[data-order-lines]")
      .forEach((el) => (el.textContent = list.children.length));
  }
  lineForm.querySelector("[data-add-line]").addEventListener("click", () => {
    if (list.children.length >= 100) return;
    const line = list.firstElementChild.cloneNode(true);
    line
      .querySelectorAll("input")
      .forEach(
        (input) => (input.value = input.name === "quantity" ? "1" : "0"),
      );
    line.querySelectorAll("select").forEach((select) => (select.value = ""));
    list.append(line);
    syncProducts();
    updateTotals();
    line.querySelector("select").focus();
  });
  list.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-line]");
    if (remove && list.children.length > 1) {
      remove.closest(".order-line").remove();
      updateTotals();
    }
  });
  list.addEventListener("input", updateTotals);
  list.addEventListener("change", updateTotals);
  supplier?.addEventListener("change", () => {
    syncProducts();
    updateTotals();
  });
  syncProducts();
  updateTotals();
}
const restoreFile = document.getElementById("backup-file");
restoreFile?.addEventListener("change", async () => {
  const file = restoreFile.files[0];
  const status = document.getElementById("backup-file-status");
  const value = document.getElementById("backup-content");
  value.value = "";
  if (!file) return;
  if (file.size > 7000000) {
    status.textContent = "Choose a backup smaller than 7 MB.";
    restoreFile.value = "";
    return;
  }
  try {
    const content = await file.text();
    const data = JSON.parse(content);
    if (data.format !== "stockpilot-backup" || data.version !== 2)
      throw new Error();
    value.value = content;
    status.textContent = `Backup ready · Created ${new Date(data.createdAt).toLocaleString()}`;
  } catch {
    status.textContent = "This is not a valid StockPilot backup file.";
    restoreFile.value = "";
  }
});
