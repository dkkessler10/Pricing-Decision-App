const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const context = { window: {}, Intl };
vm.createContext(context);
vm.runInContext(fs.readFileSync("model-data.js", "utf8"), context);
vm.runInContext(fs.readFileSync("app.js", "utf8"), context);
const {
  calculateProposedPrice, modelFeatures, predictDemand, demandScenarios,
  calculateProjection, calculateScenario, priceRangeWarning, optimizePrice, validateValues,
  readFormValues, applyProductDefaults, calculateDecision
} = context.window.PricingApp;
const model = context.window.DEMAND_MODEL;

assert.ok(Math.abs(calculateProposedPrice(100, 10) - 110) < 1e-12);
assert.ok(Math.abs(calculateProposedPrice(100, -10) - 90) < 1e-12);
assert.ok(Math.abs(calculateProposedPrice(29.35, 5) - 30.8175) < 1e-12);

assert.equal(model.trainingObservations, 459);
assert.equal(model.excludedConstrained, 285);
assert.equal(model.totalObservations, 744);
assert.equal(model.coefficients.length, 15);
assert.equal(model.validation["linear ridge"].observations, 99);
assert.ok(model.validation["linear ridge"].mae < model.validation["product-period baseline"].mae);
assert.equal(model.residualQuantiles.lowerPercentile, 20);
assert.equal(model.residualQuantiles.upperPercentile, 80);

const features = modelFeatures(model, { product: "Milk", dataset: "Extended", period: 8, price: 28.18, marketPrice: 27.5 });
assert.equal(features.length, model.coefficients.length);
const predicted = predictDemand(model, "Milk", 28.18);
assert.ok(Number.isFinite(predicted) && predicted >= 0);

const demandRange = demandScenarios(model, "Milk", 28.18);
assert.ok(demandRange.low <= demandRange.expected);
assert.ok(demandRange.expected <= demandRange.high);
const projectedRange = calculateScenario(model, "Milk", 28.18, 100);
assert.ok(projectedRange.high.endingInventory <= projectedRange.expected.endingInventory);
assert.ok(projectedRange.expected.endingInventory <= projectedRange.low.endingInventory);

const constrained = calculateProjection(120, 100, 30, 20);
assert.equal(constrained.unitsSold, 100);
assert.equal(constrained.endingInventory, 0);
assert.ok(constrained.unitsSold <= 100);
assert.ok(constrained.endingInventory >= 0);
assert.equal(constrained.revenue, 3000);
assert.equal(constrained.profit, 1000);
assert.equal(constrained.margin, 1 / 3);
const unconstrained = calculateProjection(80, 100, 30, 20);
assert.equal(unconstrained.unitsSold, 80);
assert.equal(unconstrained.endingInventory, 20);
assert.equal(unconstrained.profit, 800);

const optimized = optimizePrice(model, "Milk", 474);
assert.equal(optimized.minimum, model.priceRanges.Milk.minimum);
assert.equal(optimized.maximum, model.priceRanges.Milk.maximum);
assert.equal(optimized.scenarios.length, 101);
assert.ok(optimized.best.price >= optimized.minimum && optimized.best.price <= optimized.maximum);
assert.ok(optimized.best.low.profit <= optimized.best.expected.profit);
assert.ok(optimized.best.expected.profit <= optimized.best.high.profit);

assert.equal(priceRangeWarning(model, "Milk", model.priceRanges.Milk.minimum - 0.01), true);
assert.equal(priceRangeWarning(model, "Milk", model.priceRanges.Milk.maximum + 0.01), true);
assert.equal(priceRangeWarning(model, "Milk", model.priceRanges.Milk.minimum), false);
assert.equal(priceRangeWarning(model, "Milk", model.priceRanges.Milk.maximum), false);

const invalid = validateValues({ currentPrice: "", priceChange: "-100", inventory: "-1" });
assert.equal(invalid.currentPrice, "Required");
assert.equal(invalid.priceChange, "Must be greater than −100%");
assert.equal(invalid.inventory, "Must be 0 or more");
assert.deepEqual({ ...validateValues({ currentPrice: "30", priceChange: "5", inventory: "0" }) }, {});

// Regression: defaults are a one-time/product-change action; calculations only read visible values.
const visibleFields = {
  currentPrice: { value: "" },
  priceChange: { value: "" },
  inventory: { value: "" }
};
applyProductDefaults(model, "Ice Cream", visibleFields);
assert.equal(visibleFields.currentPrice.value, model.defaults["Ice Cream"].currentPrice.toFixed(2));
assert.equal(visibleFields.inventory.value, String(Math.round(model.defaults["Ice Cream"].inventory)));

visibleFields.currentPrice.value = "45.00";
visibleFields.priceChange.value = "10";
visibleFields.inventory.value = "50";
const editedValues = readFormValues(visibleFields);
const editedDecision = calculateDecision(model, "Ice Cream", editedValues);
assert.equal(editedDecision.currentPrice, 45);
assert.equal(editedDecision.priceChange, 10);
assert.equal(editedDecision.inventory, 50);
assert.ok(Math.abs(editedDecision.proposedPrice - 49.5) < 1e-12);
for (const scenario of [editedDecision.current, editedDecision.proposed]) {
  for (const outcome of Object.values(scenario)) {
    assert.ok(outcome.unitsSold <= 50);
    assert.ok(outcome.endingInventory >= 0);
    assert.ok(Math.abs(outcome.endingInventory - (50 - outcome.unitsSold)) < 1e-12);
  }
}
assert.deepEqual({ ...readFormValues(visibleFields) }, { currentPrice: "45.00", priceChange: "10", inventory: "50" });
assert.ok(editedDecision.optimizer.best.expected.unitsSold <= 50);
assert.ok(editedDecision.optimizer.best.expected.endingInventory >= 0);

const fivePercentDecision = calculateDecision(model, "Ice Cream", { ...editedValues, priceChange: "5" });
assert.ok(Math.abs(fivePercentDecision.proposedPrice - 47.25) < 1e-12);
assert.notEqual(fivePercentDecision.proposed.expected.revenue, editedDecision.proposed.expected.revenue);
const defaultPriceDecision = calculateDecision(model, "Ice Cream", { ...editedValues, currentPrice: "48.50" });
assert.notEqual(defaultPriceDecision.current.expected.revenue, editedDecision.current.expected.revenue);

applyProductDefaults(model, "Milk", visibleFields);
assert.equal(visibleFields.currentPrice.value, model.defaults.Milk.currentPrice.toFixed(2));
assert.equal(visibleFields.inventory.value, String(Math.round(model.defaults.Milk.inventory)));
visibleFields.inventory.value = "25";
const milkOverride = calculateDecision(model, "Milk", readFormValues(visibleFields));
assert.ok(milkOverride.current.expected.unitsSold <= 25);
assert.equal(visibleFields.inventory.value, "25");

console.log("All simplified pricing, variability, inventory, optimizer, range-warning, and validation tests passed.");
