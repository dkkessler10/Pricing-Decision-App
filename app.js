(function () {
  "use strict";

  const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  const whole = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 1 });

  function modelFeatures(model, values) {
    const features = [1];
    features.push(...model.products.slice(1).map((product) => values.product === product ? 1 : 0));
    features.push(values.dataset === "Extended" ? 1 : 0);
    features.push(Number(values.period));
    features.push(...model.products.map((product) => values.product === product ? Number(values.price) : 0));
    features.push(Number(values.price) / Number(values.marketPrice));
    return features;
  }

  function predictDemand(model, values) {
    return Math.max(0, modelFeatures(model, values).reduce((total, value, index) => total + value * model.coefficients[index], 0));
  }

  function calculateProjection(demand, inventory, price, unitCost) {
    const unitsSold = Math.min(demand, inventory);
    const endingInventory = Math.max(0, inventory - unitsSold);
    const lostSales = Math.max(0, demand - inventory);
    const revenue = unitsSold * price;
    const profit = (price - unitCost) * unitsSold;
    return { demand, unitsSold, endingInventory, lostSales, price, revenue, profit, margin: revenue ? profit / revenue : 0 };
  }

  function optimizePrice(model, values, unitCost, inventory, steps = 100) {
    const range = model.priceRanges[values.product];
    const scenarios = [];
    for (let index = 0; index <= steps; index += 1) {
      const price = range.minimum + ((range.maximum - range.minimum) * index / steps);
      const demand = predictDemand(model, { ...values, price });
      scenarios.push(calculateProjection(demand, inventory, price, unitCost));
    }
    const best = scenarios.reduce((winner, scenario) => scenario.profit > winner.profit ? scenario : winner);
    return { ...range, best, scenarios };
  }

  function validateValues(values) {
    const errors = {};
    ["proposedPrice", "inventory", "marketPrice", "unitCost"].forEach((key) => {
      const raw = String(values[key] ?? "").trim();
      if (!raw) errors[key] = "Required";
      else if (!Number.isFinite(Number(raw))) errors[key] = "Enter a number";
      else if (Number(raw) < 0) errors[key] = "Must be 0 or more";
    });
    if (!errors.proposedPrice && Number(values.proposedPrice) === 0) errors.proposedPrice = "Must be greater than 0";
    if (!errors.marketPrice && Number(values.marketPrice) === 0) errors.marketPrice = "Must be greater than 0";
    return errors;
  }

  function summariseProduct(records) {
    const totalUnits = records.reduce((sum, row) => sum + row.units, 0);
    const totalCost = records.reduce((sum, row) => sum + row.cost, 0);
    return { unitCost: totalCost / totalUnits };
  }

  function init() {
    const model = window.DEMAND_MODEL;
    const records = window.HISTORICAL_SALES || [];
    const form = document.querySelector("#scenario-form");
    const product = document.querySelector("#product");
    const dataset = document.querySelector("#dataset");
    const period = document.querySelector("#period");
    const fields = {
      proposedPrice: document.querySelector("#proposed-price"), inventory: document.querySelector("#inventory"),
      marketPrice: document.querySelector("#market-price"), unitCost: document.querySelector("#unit-cost")
    };
    product.innerHTML = model.products.map((name) => `<option value="${name}">${name}</option>`).join("");

    function fillDefaults() {
      const context = model.contexts[`${dataset.value}|${product.value}`];
      period.innerHTML = model.periods.filter((value) => value <= context.period).map((value) => `<option value="${value}">${value}</option>`).join("");
      period.value = String(context.period);
      fields.proposedPrice.value = context.currentPrice.toFixed(2);
      fields.inventory.value = String(context.inventory);
      fields.marketPrice.value = context.marketPrice.toFixed(2);
      fields.unitCost.value = summariseProduct(records.filter((row) => row.product === product.value && row.dataset === dataset.value)).unitCost.toFixed(2);
      const range = model.priceRanges[product.value];
      document.querySelector("#product-context").textContent = `Model price range ${money.format(range.minimum)}–${money.format(range.maximum)} · predicts total demand for one simulation step.`;
      document.querySelector("#inventory-context").textContent = `Defaults to the ${dataset.value} workbook's current inventory across all locations.`;
      document.querySelector("#market-context").textContent = `Latest quantity-weighted market price for ${dataset.value}.`;
      document.querySelector("#cost-context").textContent = "Historical weighted average cost per delivered unit.";
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
        document.querySelector("#form-message").textContent = "Correct the highlighted values to calculate the model estimate.";
        if (focusOnError) fields[Object.keys(errors)[0]].focus();
        return;
      }
      const input = { product: product.value, dataset: dataset.value, period: Number(period.value), price: Number(values.proposedPrice), marketPrice: Number(values.marketPrice) };
      const projection = calculateProjection(predictDemand(model, input), Number(values.inventory), input.price, Number(values.unitCost));
      renderProjection(projection);
      renderOptimizer(optimizePrice(model, input, Number(values.unitCost), Number(values.inventory)));
    }

    function renderProjection(result) {
      document.querySelector("#predicted-demand").textContent = whole.format(result.demand);
      document.querySelector("#expected-sales").textContent = whole.format(result.unitsSold);
      document.querySelector("#ending-inventory").textContent = whole.format(result.endingInventory);
      document.querySelector("#lost-sales").textContent = whole.format(result.lostSales);
      document.querySelector("#projected-revenue").textContent = money.format(result.revenue);
      document.querySelector("#projected-profit").textContent = money.format(result.profit);
      document.querySelector("#projected-margin").textContent = percent.format(result.margin);
      const callout = document.querySelector("#decision-callout");
      callout.className = `decision-callout ${result.profit >= 0 ? "positive" : "negative"}`;
      document.querySelector("#profit-change").textContent = money.format(result.profit);
      document.querySelector("#decision-copy").textContent = result.lostSales > 0
        ? `Inventory constrains expected sales; estimated lost sales are ${whole.format(result.lostSales)} units.`
        : "Available inventory is sufficient for the model's predicted demand.";
    }

    function renderOptimizer(result) {
      const best = result.best;
      document.querySelector("#optimal-price").textContent = money.format(best.price);
      document.querySelector("#optimal-demand").textContent = whole.format(best.demand);
      document.querySelector("#optimal-units").textContent = whole.format(best.unitsSold);
      document.querySelector("#optimal-profit").textContent = money.format(best.profit);
      document.querySelector("#optimal-lost-sales").textContent = whole.format(best.lostSales);
      document.querySelector("#optimizer-range").textContent = `Evaluated only within the observed ${product.value} range, ${money.format(result.minimum)}–${money.format(result.maximum)}.`;
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
      const maxProfit = Math.max(...scenarios.map((item) => item.profit), 1); const minProfit = Math.min(...scenarios.map((item) => item.profit), 0);
      const maxDemand = Math.max(...scenarios.map((item) => item.demand), 1);
      const x = (price) => pad.left + (price - scenarios[0].price) / (scenarios.at(-1).price - scenarios[0].price) * plotWidth;
      const py = (value) => pad.top + (maxProfit - value) / (maxProfit - minProfit || 1) * plotHeight;
      const dy = (value) => pad.top + (maxDemand - value) / maxDemand * plotHeight;
      context.font = "11px system-ui"; context.fillStyle = "#65716a"; context.strokeStyle = "#dcded8";
      for (let tick = 0; tick <= 4; tick += 1) {
        const y = pad.top + plotHeight * tick / 4; context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
        context.textAlign = "right"; context.fillText(money.format(maxProfit - (maxProfit - minProfit) * tick / 4), pad.left - 7, y + 4);
        context.textAlign = "left"; context.fillText(whole.format(maxDemand * (1 - tick / 4)), width - pad.right + 7, y + 4);
      }
      [["#165c45", py, "profit"], ["#9b5d16", dy, "demand"]].forEach(([color, y, key]) => {
        context.strokeStyle = color; context.lineWidth = 3; context.beginPath();
        scenarios.forEach((item, index) => index ? context.lineTo(x(item.price), y(item[key])) : context.moveTo(x(item.price), y(item[key]))); context.stroke();
      });
      context.fillStyle = "#dce858"; context.strokeStyle = "#165c45"; context.beginPath(); context.arc(x(best.price), py(best.profit), 6, 0, Math.PI * 2); context.fill(); context.stroke();
      context.fillStyle = "#17211b"; context.textAlign = "center"; context.fillText("Price", pad.left + plotWidth / 2, height - 5);
      [0, scenarios.length - 1].forEach((index) => context.fillText(money.format(scenarios[index].price), x(scenarios[index].price), height - 22));
    }

    product.addEventListener("change", fillDefaults); dataset.addEventListener("change", fillDefaults);
    period.addEventListener("change", () => compare(null, false)); form.addEventListener("submit", compare);
    Object.values(fields).forEach((field) => field.addEventListener("input", (event) => compare(event, false)));
    document.querySelector("#reset-button").addEventListener("click", fillDefaults);
    window.addEventListener("resize", () => compare(null, false)); fillDefaults();
  }

  window.PricingApp = { modelFeatures, predictDemand, calculateProjection, optimizePrice, validateValues, summariseProduct };
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
}());
