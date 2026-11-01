class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}
function text(value, label, { required = true, max = 160 } = {}) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new ValidationError(`${label} is required.`);
  if (result.length > max)
    throw new ValidationError(`${label} must be at most ${max} characters.`);
  return result;
}
function integer(value, label, min = 1, max = 100000000) {
  const result = Number(value);
  if (
    value === "" ||
    value == null ||
    !Number.isSafeInteger(result) ||
    result < min ||
    result > max
  )
    throw new ValidationError(
      `${label} must be a whole number between ${min} and ${max}.`,
    );
  return result;
}
function money(value, label = "Price") {
  const result = Number(value);
  if (
    value === "" ||
    value == null ||
    !Number.isFinite(result) ||
    result < 0 ||
    result > 10000000 ||
    Math.abs(result * 100 - Math.round(result * 100)) > 0.000001
  )
    throw new ValidationError(
      `${label} must be a positive amount or zero, with at most two decimal places.`,
    );
  return Math.round(result * 100) / 100;
}
function date(value, label = "Date") {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new ValidationError(`${label} must be a valid date.`);
  return value;
}
function contact(body) {
  const email = text(body.email, "Email", { required: false, max: 254 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ValidationError("Enter a valid email address.");
  return {
    name: text(body.name, "Name"),
    email,
    phone: text(body.phone, "Phone", { required: false, max: 40 }),
    address: text(body.address, "Address", { required: false, max: 500 }),
  };
}
function totalCents(lines, getPrice, getQuantity) {
  const cents = lines.reduce(
    (sum, line) => sum + Math.round(getPrice(line) * 100) * getQuantity(line),
    0,
  );
  if (!Number.isSafeInteger(cents))
    throw new ValidationError("The order total exceeds the supported amount.");
  return cents / 100;
}
module.exports = {
  text,
  integer,
  money,
  date,
  contact,
  totalCents,
  ValidationError,
};
