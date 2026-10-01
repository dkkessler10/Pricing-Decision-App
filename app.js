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

  function calculateDemand(currentUnits, proposedPrice, currentPrice, elasticity) {
    return currentUnits * Math.pow(proposedPrice / currentPrice, elasticity);
  }

  function optimizePrice(currentPrice, currentUnits, unitCost, elasticity, steps = 300) {
    const minimum = currentPrice * 0.5;
    const maximum = currentPrice * 2;
    const scenarios = [];
    for (let index = 0; index <= steps; index += 1) {
      const price = minimum + ((maximum - minimum) * index / steps);
      const units = calculateDemand(currentUnits, price, currentPrice, elasticity);
      scenarios.push(calculateScenario(price, units, unitCost));
    }
    const best = scenarios.reduce((winner, scenario) => {
      if (scenario.profit > winner.profit) return scenario;
      if (Math.abs(scenario.profit - winner.profit) < 0.000001 && Math.abs(scenario.price - currentPrice) < Math.abs(winner.price - currentPrice)) return scenario;
      return winner;
    });
    return { minimum, maximum, best, scenarios };
  }

  function validateValues(values) {
    const errors = {};
    ["currentPrice", "proposedPrice", "currentUnits", "unitCost", "elasticity"].forEach((key) => {
      const raw = String(values[key] ?? "").trim();
      if (!raw) errors[key] = "Required";
      else if (!Number.isFinite(Number(raw))) errors[key] = "Enter a number";
      else if (key !== "elasticity" && Number(raw) < 0) errors[key] = "Must be 0 or more";
    });
    if (!errors.currentPrice && Number(values.currentPrice) === 0) errors.currentPrice = "Must be greater than 0";
    if (!errors.proposedPrice && Number(values.proposedPrice) === 0) errors.proposedPrice = "Must be greater than 0";
    if (!errors.elasticity && Number(values.elasticity) >= 0) errors.elasticity = "Use a negative value";
    if (!errors.elasticity && Number(values.elasticity) < -10) errors.elasticity = "Use −10 or greater";
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
      currentUnits: document.querySelector("#current-units"), unitCost: document.querySelector("#unit-cost"),
      elasticity: document.querySelector("#elasticity")
    };
    const products = [...new Set(records.map((row) => row.product))].sort();
    product.innerHTML = products.map((name) => `<option value="${name}">${name}</option>`).join("");

    function fillDefaults() {
      const productRows = records.filter((row) => row.product === product.value);
      const summary = summariseProduct(productRows);
      fields.currentPrice.value = summary.defaultPrice.toFixed(2);
      fields.proposedPrice.value = (summary.defaultPrice * 1.03).toFixed(2);
      fields.currentUnits.value = String(summary.medianUnits);
      fields.unitCost.value = summary.unitCost.toFixed(2);
      fields.elasticity.value = "-1.5";
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

    function compare(event, focusOnError = true) {
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
        document.querySelector("#calculated-units").textContent = "—";
        if (focusOnError) fields[Object.keys(errors)[0]].focus();
        return;
      }
      const numeric = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
      const current = calculateScenario(numeric.currentPrice, numeric.currentUnits, numeric.unitCost);
      const proposedUnits = calculateDemand(numeric.currentUnits, numeric.proposedPrice, numeric.currentPrice, numeric.elasticity);
      const proposed = calculateScenario(numeric.proposedPrice, proposedUnits, numeric.unitCost);
      document.querySelector("#calculated-units").textContent = whole.format(proposedUnits);
      renderResults(current, proposed);
      renderBenchmark(records.filter((row) => row.product === product.value), proposed.price);
      renderOptimizer(optimizePrice(numeric.currentPrice, numeric.currentUnits, numeric.unitCost, numeric.elasticity), current);
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

    function renderOptimizer(result, current) {
      const best = result.best;
      const change = best.profit - current.profit;
      document.querySelector("#optimal-price").textContent = money.format(best.price);
      document.querySelector("#optimal-units").textContent = whole.format(best.units);
      document.querySelector("#optimal-revenue").textContent = money.format(best.revenue);
      document.querySelector("#optimal-profit").textContent = money.format(best.profit);
      const changeNode = document.querySelector("#optimal-change");
      changeNode.textContent = `${change >= 0 ? "+" : "−"}${money.format(Math.abs(change))}`;
      changeNode.className = change >= 0 ? "gain" : "loss";
      drawChart(result.scenarios, best);
    }

    function drawChart(scenarios, best) {
      const canvas = document.querySelector("#profit-chart");
      const context = canvas.getContext("2d");
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 720;
      const height = 270;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const padding = { top: 20, right: 18, bottom: 50, left: 70 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      const profits = scenarios.map((scenario) => scenario.profit);
      let minProfit = Math.min(...profits, 0);
      let maxProfit = Math.max(...profits, 0);
      if (maxProfit === minProfit) maxProfit = minProfit + 1;
      const profitPad = (maxProfit - minProfit) * 0.08;
      minProfit -= profitPad;
      maxProfit += profitPad;
      const x = (price) => padding.left + ((price - scenarios[0].price) / (scenarios.at(-1).price - scenarios[0].price)) * plotWidth;
      const y = (profit) => padding.top + ((maxProfit - profit) / (maxProfit - minProfit)) * plotHeight;

      context.strokeStyle = "#dcded8";
      context.fillStyle = "#65716a";
      context.font = "11px system-ui, sans-serif";
      context.lineWidth = 1;
      for (let tick = 0; tick <= 4; tick += 1) {
        const value = minProfit + ((maxProfit - minProfit) * tick / 4);
        const tickY = y(value);
        context.beginPath(); context.moveTo(padding.left, tickY); context.lineTo(width - padding.right, tickY); context.stroke();
        context.textAlign = "right"; context.fillText(compactMoney(value), padding.left - 9, tickY + 4);
      }
      [0, Math.floor((scenarios.length - 1) / 2), scenarios.length - 1].forEach((index) => {
        context.textAlign = "center";
        context.fillText(money.format(scenarios[index].price), x(scenarios[index].price), height - 23);
      });
      context.fillStyle = "#17211b";
      context.font = "600 11px system-ui, sans-serif";
      context.fillText("Price", padding.left + plotWidth / 2, height - 5);
      context.save();
      context.translate(12, padding.top + plotHeight / 2);
      context.rotate(-Math.PI / 2);
      context.fillText("Projected profit", 0, 0);
      context.restore();
      context.strokeStyle = "#165c45";
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.beginPath();
      scenarios.forEach((scenario, index) => {
        if (index === 0) context.moveTo(x(scenario.price), y(scenario.profit));
        else context.lineTo(x(scenario.price), y(scenario.profit));
      });
      context.stroke();
      context.fillStyle = "#dce858";
      context.strokeStyle = "#165c45";
      context.lineWidth = 3;
      context.beginPath(); context.arc(x(best.price), y(best.profit), 6, 0, Math.PI * 2); context.fill(); context.stroke();
    }

    function compactMoney(value) {
      const absolute = Math.abs(value);
      const compact = absolute >= 1000 ? `${(absolute / 1000).toFixed(1)}k` : Math.round(absolute).toString();
      return `${value < 0 ? "−" : ""}€${compact}`;
    }

    product.addEventListener("change", fillDefaults);
    form.addEventListener("submit", compare);
    Object.values(fields).forEach((field) => field.addEventListener("input", (event) => compare(event, false)));
    document.querySelector("#reset-button").addEventListener("click", fillDefaults);
    window.addEventListener("resize", () => compare(null, false));
    fillDefaults();
  }

  window.PricingApp = { calculateScenario, calculateDemand, optimizePrice, validateValues, summariseProduct, closestBenchmark, median };
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
}());
