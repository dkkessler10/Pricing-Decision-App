const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const context = { window: {}, Intl };
vm.createContext(context);
vm.runInContext(fs.readFileSync("app.js", "utf8"), context);
const { calculateScenario, calculateDemand, optimizePrice, validateValues, summariseProduct, closestBenchmark, median } = context.window.PricingApp;

assert.deepEqual({ ...calculateScenario(30, 100, 20) }, { price: 30, units: 100, revenue: 3000, profit: 1000, margin: 1 / 3 });
assert.equal(calculateScenario(10, 0, 5).margin, 0);
assert.equal(median([5, 1, 3]), 3);
assert.equal(median([4, 2, 1, 3]), 2.5);
assert.equal(calculateDemand(100, 11, 10, -1), 100 / 1.1);
assert.equal(calculateDemand(100, 20, 10, -1.5), 100 * Math.pow(2, -1.5));

const optimized = optimizePrice(10, 100, 6, -2);
assert.equal(optimized.minimum, 5);
assert.equal(optimized.maximum, 20);
assert.ok(Math.abs(optimized.best.price - 12) < 0.001);
assert.ok(Math.abs(optimized.best.profit - (1250 / 3)) < 0.001);
assert.equal(optimized.scenarios.length, 301);

const invalid = validateValues({ currentPrice: "", proposedPrice: "abc", currentUnits: "-1", unitCost: "12", elasticity: "0" });
assert.equal(invalid.currentPrice, "Required");
assert.equal(invalid.proposedPrice, "Enter a number");
assert.equal(invalid.currentUnits, "Must be 0 or more");
assert.equal(invalid.elasticity, "Use a negative value");
assert.equal(validateValues({ currentPrice: "0", proposedPrice: "1", currentUnits: "1", unitCost: "0", elasticity: "-1.5" }).currentPrice, "Must be greater than 0");
assert.equal(validateValues({ currentPrice: "1", proposedPrice: "1", currentUnits: "1", unitCost: "0", elasticity: "-11" }).elasticity, "Use −10 or greater");

const records = [
  { price: 10, units: 2, cost: 12, revenue: 20, profit: 8 },
  { price: 10, units: 4, cost: 24, revenue: 40, profit: 16 },
  { price: 12, units: 3, cost: 18, revenue: 36, profit: 18 }
];
const summary = summariseProduct(records);
assert.deepEqual([...summary.prices], [10, 12]);
assert.equal(summary.defaultPrice, 12);
assert.equal(summary.unitCost, 6);
assert.equal(summary.medianUnits, 3);
const benchmark = closestBenchmark(records, 10.4);
assert.equal(benchmark.price, 10);
assert.equal(benchmark.count, 2);
assert.equal(benchmark.medianUnits, 3);
assert.equal(benchmark.margin, 0.4);

console.log("All demand, pricing, optimizer, validation, summary, and benchmark tests passed.");
