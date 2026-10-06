(function () {
  "use strict";

  const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  const whole = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

  function calculateProposedPrice(currentPrice, priceChangePercent) {
    return currentPrice * (1 + priceChangePercent / 100);
  }

  function modelFeatures(model, values) {
    const features = [1];
    features.push(...model.products.slice(1).map((product) => values.product === product ? 1 : 0));
    features.push(values.dataset === "Extended" ? 1 : 0);
    features.push(Number(values.period));
    features.push(...model.products.map((product) => values.product === product ? Number(values.price) : 0));
    features.push(Number(values.price) / Number(values.marketPrice));
    return features;
  }

  function predictContextDemand(model, values) {
    return Math.max(0, modelFeatures(model, values).reduce((total, value, index) => total + value * model.coefficients[index], 0));
  }

  function predictDemand(model, product, price) {
    const contexts = model.predictionContexts[product];
    return contexts.reduce((total, context) => total + predictContextDemand(model, { ...context, product, price }), 0) / contexts.length;
  }

  function demandScenarios(model, product, price) {
    const expected = predictDemand(model, product, price);
    return {
      low: Math.max(0, expected + model.residualQuantiles.low),
      expected,
      high: Math.max(expected, expected + model.residualQuantiles.high)
    };
  }

  function calculateProjection(demand, inventory, price, unitCost) {
    const unitsSold = Math.min(demand, inventory);
    const endingInventory = Math.max(0, inventory - unitsSold);
    const revenue = unitsSold * price;
    const profit = (price - unitCost) * unitsSold;
    return { price, demand, unitsSold, endingInventory, revenue, profit, margin: revenue ? profit / revenue : 0 };
  }

  function calculateScenario(model, product, price, inventory) {
    const demands = demandScenarios(model, product, price);
    const unitCost = model.defaults[product].unitCost;
    return Object.fromEntries(Object.entries(demands).map(([name, demand]) => [name, calculateProjection(demand, inventory, price, unitCost)]));
  }

  function priceRangeWarning(model, product, price) {
    const range = model.priceRanges[product];
    return price < range.minimum || price > range.maximum;
  }

  function optimizePrice(model, product, inventory, steps = 100) {
    const range = model.priceRanges[product];
    const scenarios = [];
    for (let index = 0; index <= steps; index += 1) {
      const price = range.minimum + ((range.maximum - range.minimum) * index / steps);
      const outcomes = calculateScenario(model, product, price, inventory);
      scenarios.push({ price, ...outcomes });
    }
    const best = scenarios.reduce((winner, scenario) => scenario.expected.profit > winner.expected.profit ? scenario : winner);
    return { ...range, best, scenarios };
  }

  function validateValues(values) {
    const errors = {};
    ["currentPrice", "priceChange", "inventory"].forEach((key) => {
      const raw = String(values[key] ?? "").trim();
      if (!raw) errors[key] = "Required";
      else if (!Number.isFinite(Number(raw))) errors[key] = "Enter a number";
    });
    if (!errors.currentPrice && Number(values.currentPrice) <= 0) errors.currentPrice = "Must be greater than 0";
    if (!errors.priceChange && Number(values.priceChange) <= -100) errors.priceChange = "Must be greater than −100%";
    if (!errors.inventory && Number(values.inventory) < 0) errors.inventory = "Must be 0 or more";
    return errors;
  }

  function init() {
    const model = window.DEMAND_MODEL;
    const form = document.querySelector("#scenario-form");
    const product = document.querySelector("#product");
    const fields = {
      currentPrice: document.querySelector("#current-price"),
      priceChange: document.querySelector("#price-change"),
      inventory: document.querySelector("#inventory")
    };
    product.innerHTML = model.products.map((name) => `<option value="${name}">${name}</option>`).join("");

    function fillDefaults() {
      const defaults = model.defaults[product.value];
      fields.currentPrice.value = defaults.currentPrice.toFixed(2);
      fields.priceChange.value = "5";
      fields.inventory.value = String(Math.round(defaults.inventory));
      const range = model.priceRanges[product.value];
      document.querySelector("#product-context").textContent = `Historical price range ${money.format(range.minimum)}–${money.format(range.maximum)}.`;
      document.querySelector("#inventory-context").textContent = "Prefilled from the average of the latest Regular and Extended inventory snapshots.";
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
        document.querySelector("#form-message").textContent = "Correct the highlighted values to compare prices.";
        if (focusOnError) fields[Object.keys(errors)[0]].focus();
        return;
      }
      const currentPrice = Number(values.currentPrice);
      const proposedPrice = calculateProposedPrice(currentPrice, Number(values.priceChange));
      const inventory = Number(values.inventory);
      const current = calculateScenario(model, product.value, currentPrice, inventory);
      const proposed = calculateScenario(model, product.value, proposedPrice, inventory);
      renderComparison(current.expected, proposed.expected, Number(values.priceChange));
      renderRange(proposed);
      renderWarning(proposedPrice);
      renderOptimizer(optimizePrice(model, product.value, inventory));
    }

    function renderComparison(current, proposed, changePercent) {
      const profitChange = proposed.profit - current.profit;
      const profitChangePercent = current.profit === 0 ? null : profitChange / Math.abs(current.profit);
      document.querySelector("#proposed-price-output").textContent = money.format(proposed.price);
      document.querySelector("#price-change-output").textContent = percent.format(changePercent / 100);
      const outputs = {
        "current-price-output": money.format(current.price), "proposed-price-result": money.format(proposed.price),
        "current-demand": whole.format(current.demand), "proposed-demand": whole.format(proposed.demand),
        "current-sales": whole.format(current.unitsSold), "proposed-sales": whole.format(proposed.unitsSold),
        "current-ending": whole.format(current.endingInventory), "proposed-ending": whole.format(proposed.endingInventory),
        "current-revenue": money.format(current.revenue), "proposed-revenue": money.format(proposed.revenue),
        "current-profit": money.format(current.profit), "proposed-profit": money.format(proposed.profit),
        "current-margin": percent.format(current.margin), "proposed-margin": percent.format(proposed.margin)
      };
      Object.entries(outputs).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
      document.querySelector("#profit-change").textContent = `${profitChange >= 0 ? "+" : "−"}${money.format(Math.abs(profitChange))}`;
      document.querySelector("#profit-change-percent").textContent = profitChangePercent === null ? "Not available" : percent.format(profitChangePercent);
      const positive = profitChange >= 0;
      document.querySelector("#decision-callout").className = `decision-callout ${positive ? "positive" : "negative"}`;
      document.querySelector("#decision-copy").textContent = `Expected contribution profit ${positive ? "increases" : "decreases"} at the proposed price.`;
    }

    function renderRange(outcomes) {
      const rows = ["demand", "unitsSold", "endingInventory", "revenue", "profit"];
      rows.forEach((metric) => ["low", "expected", "high"].forEach((scenario) => {
        const value = outcomes[scenario][metric];
        document.querySelector(`#range-${metric}-${scenario}`).textContent = ["revenue", "profit"].includes(metric) ? money.format(value) : whole.format(value);
      }));
      document.querySelector("#minimum-ending").textContent = whole.format(outcomes.high.endingInventory);
      document.querySelector("#expected-ending").textContent = whole.format(outcomes.expected.endingInventory);
      document.querySelector("#maximum-ending").textContent = whole.format(outcomes.low.endingInventory);
      const profits = [outcomes.low.profit, outcomes.expected.profit, outcomes.high.profit];
      document.querySelector("#minimum-profit").textContent = money.format(Math.min(...profits));
      document.querySelector("#expected-profit-range").textContent = money.format(outcomes.expected.profit);
      document.querySelector("#maximum-profit").textContent = money.format(Math.max(...profits));
    }

    function renderWarning(price) {
      const warning = document.querySelector("#range-warning");
      warning.hidden = !priceRangeWarning(model, product.value, price);
    }

    function renderOptimizer(result) {
      const best = result.best;
      document.querySelector("#optimal-price").textContent = money.format(best.price);
      document.querySelector("#optimal-units").textContent = whole.format(best.expected.unitsSold);
      document.querySelector("#optimal-ending").textContent = whole.format(best.expected.endingInventory);
      document.querySelector("#optimal-profit").textContent = money.format(best.expected.profit);
      document.querySelector("#optimal-range").textContent = `${money.format(best.low.profit)}–${money.format(best.high.profit)}`;
      document.querySelector("#optimizer-range").textContent = `Search limited to the observed ${product.value} range, ${money.format(result.minimum)}–${money.format(result.maximum)}.`;
      drawChart(result.scenarios, best);
    }

    function drawChart(scenarios, best) {
      const canvas = document.querySelector("#profit-chart");
      const context = canvas.getContext("2d");
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 720;
      const height = 270;
      canvas.width = width * ratio; canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      const pad = { top: 20, right: 58, bottom: 45, left: 68 };
      const plotWidth = width - pad.left - pad.right; const plotHeight = height - pad.top - pad.bottom;
      const profits = scenarios.flatMap((item) => [item.low.profit, item.high.profit]);
      const minProfit = Math.min(...profits, 0); const maxProfit = Math.max(...profits, 1);
      const maxDemand = Math.max(...scenarios.map((item) => item.expected.demand), 1);
      const x = (price) => pad.left + (price - scenarios[0].price) / (scenarios.at(-1).price - scenarios[0].price) * plotWidth;
      const py = (value) => pad.top + (maxProfit - value) / (maxProfit - minProfit || 1) * plotHeight;
      const dy = (value) => pad.top + (maxDemand - value) / maxDemand * plotHeight;
      context.font = "11px system-ui"; context.fillStyle = "#65716a"; context.strokeStyle = "#dcded8";
      for (let tick = 0; tick <= 4; tick += 1) {
        const y = pad.top + plotHeight * tick / 4; context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
        context.textAlign = "right"; context.fillText(money.format(maxProfit - (maxProfit - minProfit) * tick / 4), pad.left - 7, y + 4);
        context.textAlign = "left"; context.fillText(whole.format(maxDemand * (1 - tick / 4)), width - pad.right + 7, y + 4);
      }
      context.fillStyle = "rgba(22, 92, 69, 0.14)"; context.beginPath();
      scenarios.forEach((item, index) => index ? context.lineTo(x(item.price), py(item.high.profit)) : context.moveTo(x(item.price), py(item.high.profit)));
      [...scenarios].reverse().forEach((item) => context.lineTo(x(item.price), py(item.low.profit))); context.closePath(); context.fill();
      [["#165c45", py, (item) => item.expected.profit], ["#9b5d16", dy, (item) => item.expected.demand]].forEach(([color, y, value]) => {
        context.strokeStyle = color; context.lineWidth = 3; context.beginPath();
        scenarios.forEach((item, index) => index ? context.lineTo(x(item.price), y(value(item))) : context.moveTo(x(item.price), y(value(item)))); context.stroke();
      });
      context.fillStyle = "#dce858"; context.strokeStyle = "#165c45"; context.beginPath(); context.arc(x(best.price), py(best.expected.profit), 6, 0, Math.PI * 2); context.fill(); context.stroke();
      context.fillStyle = "#17211b"; context.textAlign = "center"; context.fillText("Price", pad.left + plotWidth / 2, height - 5);
      [0, scenarios.length - 1].forEach((index) => context.fillText(money.format(scenarios[index].price), x(scenarios[index].price), height - 22));
    }

    product.addEventListener("change", fillDefaults);
    form.addEventListener("submit", compare);
    Object.values(fields).forEach((field) => field.addEventListener("input", (event) => compare(event, false)));
    document.querySelector("#reset-button").addEventListener("click", fillDefaults);
    window.addEventListener("resize", () => compare(null, false));
    fillDefaults();
  }

  window.PricingApp = { calculateProposedPrice, modelFeatures, predictDemand, demandScenarios, calculateProjection, calculateScenario, priceRangeWarning, optimizePrice, validateValues };
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
}());
