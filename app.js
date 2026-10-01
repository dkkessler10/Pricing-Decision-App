(function () {
  "use strict";

  const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  const whole = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 1 });

  function calculateScenario(price, units, unitCost) {
    const revenue = price * units;
    const profit = (price - unitCost) * units;
    return { price, units, revenue, profit, margin: revenue === 0 ? 0 : profit / revenue };
  }

  function validateValues(values) {
    const errors = {};
    ["currentPrice", "proposedPrice", "currentUnits", "proposedUnits", "unitCost"].forEach((key) => {
      const raw = String(values[key] ?? "").trim();
      if (!raw) errors[key] = "Required";
      else if (!Number.isFinite(Number(raw))) errors[key] = "Enter a number";
      else if (Number(raw) < 0) errors[key] = "Must be 0 or more";
    });
    if (!errors.currentPrice && Number(values.currentPrice) === 0) errors.currentPrice = "Must be greater than 0";
    if (!errors.proposedPrice && Number(values.proposedPrice) === 0) errors.proposedPrice = "Must be greater than 0";
    return errors;
  }

  function summariseProduct(records) {
    const prices = [...new Set(records.map((row) => row.price))].sort((a, b) => a - b);
    const totalUnits = records.reduce((sum, row) => sum + row.units, 0);
    const totalCost = records.reduce((sum, row) => sum + row.cost, 0);
    return {
      prices,
      defaultPrice: prices[prices.length - 1],
      unitCost: totalCost / totalUnits,
      medianUnits: median(records.map((row) => row.units))
    };
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function closestBenchmark(records, targetPrice) {
    const distances = records.map((row) => Math.abs(row.price - targetPrice));
    const closestDistance = Math.min(...distances);
    const matches = records.filter((row) => Math.abs(row.price - targetPrice) === closestDistance);
    const revenue = matches.reduce((sum, row) => sum + row.revenue, 0);
    const profit = matches.reduce((sum, row) => sum + row.profit, 0);
    return { price: matches[0].price, count: matches.length, medianUnits: median(matches.map((row) => row.units)), margin: profit / revenue };
  }

  function init() {
    const records = window.HISTORICAL_SALES || [];
    const form = document.querySelector("#scenario-form");
    const product = document.querySelector("#product");
    const fields = {
      currentPrice: document.querySelector("#current-price"), proposedPrice: document.querySelector("#proposed-price"),
      currentUnits: document.querySelector("#current-units"), proposedUnits: document.querySelector("#proposed-units"),
      unitCost: document.querySelector("#unit-cost")
    };
    const products = [...new Set(records.map((row) => row.product))].sort();
    product.innerHTML = products.map((name) => `<option value="${name}">${name}</option>`).join("");

    function fillDefaults() {
      const productRows = records.filter((row) => row.product === product.value);
      const summary = summariseProduct(productRows);
      fields.currentPrice.value = summary.defaultPrice.toFixed(2);
      fields.proposedPrice.value = (summary.defaultPrice * 1.03).toFixed(2);
      fields.currentUnits.value = String(summary.medianUnits);
      fields.proposedUnits.value = String(summary.medianUnits);
      fields.unitCost.value = summary.unitCost.toFixed(2);
      const range = summary.prices.length === 1 ? money.format(summary.prices[0]) : `${money.format(summary.prices[0])}–${money.format(summary.prices.at(-1))}`;
      document.querySelector("#product-context").textContent = `${productRows.length} sales lines · observed price ${summary.prices.length === 1 ? "" : "range "}${range}`;
      document.querySelector("#cost-context").textContent = `Defaults to ${money.format(summary.unitCost)}, the historical weighted average cost per delivered unit.`;
      clearErrors();
      compare();
    }

    function clearErrors() {
      Object.entries(fields).forEach(([key, input]) => {
        input.closest(".field").classList.remove("has-error");
        document.querySelector(`#${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-error`).textContent = "";
      });
      document.querySelector("#form-message").textContent = "";
    }

    function compare(event) {
      if (event) event.preventDefault();
      clearErrors();
      const values = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]));
      const errors = validateValues(values);
      if (Object.keys(errors).length) {
        Object.entries(errors).forEach(([key, message]) => {
          fields[key].closest(".field").classList.add("has-error");
          document.querySelector(`#${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-error`).textContent = message;
        });
        document.querySelector("#form-message").textContent = "Correct the highlighted values to compare scenarios.";
        fields[Object.keys(errors)[0]].focus();
        return;
      }
      const numeric = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
      const current = calculateScenario(numeric.currentPrice, numeric.currentUnits, numeric.unitCost);
      const proposed = calculateScenario(numeric.proposedPrice, numeric.proposedUnits, numeric.unitCost);
      renderResults(current, proposed);
      renderBenchmark(records.filter((row) => row.product === product.value), proposed.price);
    }

    function renderResults(current, proposed) {
      const change = proposed.profit - current.profit;
      const tolerance = 0.005;
      const state = change > tolerance ? "positive" : change < -tolerance ? "negative" : "neutral";
      const callout = document.querySelector("#decision-callout");
      const pill = document.querySelector("#decision-pill");
      callout.className = `decision-callout ${state}`;
      pill.className = `pill ${state}`;
      pill.textContent = state === "positive" ? "Improves profit" : state === "negative" ? "Worsens profit" : "No change";
      document.querySelector(".callout-icon").textContent = state === "positive" ? "↗" : state === "negative" ? "↘" : "→";
      document.querySelector("#profit-change").textContent = `${change >= 0 ? "+" : "−"}${money.format(Math.abs(change))}`;
      document.querySelector("#decision-copy").textContent = state === "positive"
        ? "The proposed price and volume assumptions increase contribution profit."
        : state === "negative" ? "The proposed assumptions reduce contribution profit; reconsider price or volume." : "The proposed assumptions leave contribution profit unchanged.";
      const outputs = {
        "current-price-output": money.format(current.price), "proposed-price-output": money.format(proposed.price),
        "current-units-output": whole.format(current.units), "proposed-units-output": whole.format(proposed.units),
        "current-revenue": money.format(current.revenue), "proposed-revenue": money.format(proposed.revenue),
        "current-profit": money.format(current.profit), "proposed-profit": money.format(proposed.profit),
        "current-margin": percent.format(current.margin), "proposed-margin": percent.format(proposed.margin)
      };
      Object.entries(outputs).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
    }

    function renderBenchmark(productRows, proposedPrice) {
      const benchmark = closestBenchmark(productRows, proposedPrice);
      document.querySelector("#benchmark-price").textContent = money.format(benchmark.price);
      document.querySelector("#benchmark-count").textContent = benchmark.count;
      document.querySelector("#benchmark-units").textContent = whole.format(benchmark.medianUnits);
      document.querySelector("#benchmark-margin").textContent = percent.format(benchmark.margin);
      const exact = Math.abs(benchmark.price - proposedPrice) < 0.005;
      document.querySelector("#benchmark-note").textContent = exact
        ? `Exact observed price match for ${product.value}. Results summarize individual historical sales lines.`
        : `No exact match: ${money.format(benchmark.price)} is the nearest observed ${product.value} price to the proposed ${money.format(proposedPrice)}.`;
    }

    product.addEventListener("change", fillDefaults);
    form.addEventListener("submit", compare);
    document.querySelector("#reset-button").addEventListener("click", fillDefaults);
    fillDefaults();
  }

  window.PricingApp = { calculateScenario, validateValues, summariseProduct, closestBenchmark, median };
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
}());
