const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
  orders:
    '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  arrows: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
  truck:
    '<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7M14 13h7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  chart: '<path d="M4 3v17h17M8 15v-4M13 15V7M18 15V4"/>',
  report: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h5"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 3v4l4 2 3-1 3 1 4-2v-4l2-3-2-4-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 10-8 10S4 17 4 12V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  down: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  logout: '<path d="M9 4H4v16h5M9 12h12m-5-5 5 5-5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  monitor:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  keyboard:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M5 10h1m3 0h1m3 0h1m3 0h1M5 14h1m3 0h9"/>',
  mouse:
    '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7M6 10h12"/>',
};
function icon(name, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
}
const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
const number = (value) => new Intl.NumberFormat("en-US").format(value || 0);
function datetime(value, short = false) {
  if (!value) return "—";
  const parsed = new Date(
    value.includes("T") ? value : value.replace(" ", "T") + "Z",
  );
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        ...(short
          ? {}
          : { year: "numeric", hour: "numeric", minute: "2-digit" }),
      }).format(parsed);
}
function status(product) {
  return !product.active
    ? "discontinued"
    : !product.stock_quantity
      ? "out-of-stock"
      : product.stock_quantity <= product.reorder_level
        ? "low-stock"
        : "in-stock";
}
const statusLabel = (status) =>
  ({
    "in-stock": "In stock",
    "low-stock": "Low stock",
    "out-of-stock": "Out of stock",
    discontinued: "Discontinued",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    pending: "Pending",
    received: "Received",
  })[status] || status;
function chart(points, key = "value") {
  const values = points.map((p) => p[key]);
  const max = Math.max(...values, 1) * 1.15;
  const coords = values.map(
    (value, i) =>
      `${48 + (i * 610) / Math.max(1, values.length - 1)},${178 - (value / max) * 145}`,
  );
  return {
    line: coords.join(" "),
    area: `48,178 ${coords.join(" ")} ${values.length > 1 ? "658" : "48"},178`,
    max,
  };
}
function productIcon(product) {
  return /keyboard/i.test(product.name)
    ? "keyboard"
    : /mouse/i.test(product.name)
      ? "mouse"
      : /monitor/i.test(product.name)
        ? "monitor"
        : product.category === "Electronics"
          ? "monitor"
          : "box";
}
module.exports = {
  icon,
  money,
  number,
  datetime,
  status,
  statusLabel,
  chart,
  productIcon,
};
