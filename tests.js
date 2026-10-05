const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const context = { window: {}, Intl };
vm.createContext(context);
vm.runInContext(fs.readFileSync("data.js", "utf8"), context);
vm.runInContext(fs.readFileSync("model-data.js", "utf8"), context);
vm.runInContext(fs.readFileSync("app.js", "utf8"), context);
const { modelFeatures, predictDemand, calculateProjection, optimizePrice, validateValues, summariseProduct } = context.window.PricingApp;
const model = context.window.DEMAND_MODEL;
const sales = context.window.HISTORICAL_SALES;

assert.equal(model.trainingObservations, 459);
assert.equal(model.excludedConstrained, 285);
assert.equal(model.totalObservations, 744);
assert.equal(model.coefficients.length, 15);
assert.equal(model.validation["linear ridge"].observations, 99);
assert.ok(model.validation["linear ridge"].mae < model.validation["product-period baseline"].mae);

const input = { product: "Milk", dataset: "Extended", period: 8, price: 28.18, marketPrice: 27.5 };
assert.equal(modelFeatures(model, input).length, model.coefficients.length);
const demand = predictDemand(model, input);
assert.ok(Number.isFinite(demand) && demand >= 0);

assert.deepEqual({ ...calculateProjection(120, 100, 30, 20) }, {
  demand: 120, unitsSold: 100, endingInventory: 0, lostSales: 20,
  price: 30, revenue: 3000, profit: 1000, margin: 1 / 3
});
assert.deepEqual({ ...calculateProjection(80, 100, 30, 20) }, {
  demand: 80, unitsSold: 80, endingInventory: 20, lostSales: 0,
  price: 30, revenue: 2400, profit: 800, margin: 1 / 3
});

const optimized = optimizePrice(model, input, 23.25, 527);
assert.equal(optimized.minimum, model.priceRanges.Milk.minimum);
assert.equal(optimized.maximum, model.priceRanges.Milk.maximum);
assert.equal(optimized.scenarios.length, 101);
assert.ok(optimized.best.price >= optimized.minimum && optimized.best.price <= optimized.maximum);

const invalid = validateValues({ proposedPrice: "", inventory: "-1", marketPrice: "abc", unitCost: "0" });
assert.equal(invalid.proposedPrice, "Required");
assert.equal(invalid.inventory, "Must be 0 or more");
assert.equal(invalid.marketPrice, "Enter a number");
assert.deepEqual({ ...validateValues({ proposedPrice: "30", inventory: "0", marketPrice: "28", unitCost: "0" }) }, {});

const milk = sales.filter((row) => row.product === "Milk" && row.dataset === "Extended");
assert.ok(Math.abs(summariseProduct(milk).unitCost - 23.3566394747314) < 1e-10);
assert.equal(sales.length, 1373);
assert.equal(sales.filter((row) => row.dataset === "Regular").length, 692);
assert.equal(sales.filter((row) => row.dataset === "Extended").length, 681);
console.log("All model, inventory projection, optimizer, validation, and current-data tests passed.");
