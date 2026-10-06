# Pricing Decision Desk — Version 2

A static, browser-based decision tool answering one question:

> **If I change this product's price by X%, what do the historical data suggest could happen to sales, remaining inventory, and profit—including a realistic range of outcomes?**

The app uses only `Full_Data_Regular.xlsx` and `Full_Data_Extended.xlsx`. The two simulations are pooled behind the scenes; users do not need to select a run or configure modeling variables.

## Simplified workflow

The interface asks for four inputs:

1. **Product**
2. **Current price**, prefilled from the mean of the two workbooks' latest Current Pricing Conditions and editable
3. **Price change percentage**, such as −10%, −5%, +5%, +10%, or +20%
4. **Starting inventory**, prefilled from the mean of the latest Regular and Extended inventory snapshots and editable

Defaults are applied only on initial page load and when the selected product changes. After that, the visible Current Price, Price Change, and Starting Inventory fields are the calculation source of truth; comparing or recalculating never restores defaults.

The proposed price is calculated automatically:

```text
Proposed price = current price × (1 + price change percentage ÷ 100)
```

The browser compares current and proposed expected outcomes side by side, shows a plausible low/expected/high range for the proposed price, and recommends the supported price with the highest expected contribution profit.

## Historical analytical dataset

`scripts/train_model.py` reads the two workbooks directly as ZIP/XML files using only Python's standard library. It combines:

- **Sales** for delivered units, own price, revenue, cost, product, area, channel, period, and simulation step;
- **Inventory / Inventory (2)** for opening stock by product, step, storage location, and area;
- **Market / Market (2)** for quantity-weighted market price by product and period;
- **Current Inventory** for starting-inventory defaults; and
- **Current Pricing Conditions** for current-price defaults.

The Sales worksheets contain 692 Regular and 681 Extended rows. They are aggregated into 744 product-by-simulation-step observations across the six products.

### Separating demand from inventory-constrained sales

Delivered sales may understate demand when inventory is scarce. For every product-step, the training pipeline compares delivered units in North, South, and West with regional opening inventory. An observation is flagged when a region has positive sales and opening inventory is no more than 105% of its delivered units.

The model excludes **285 potentially constrained observations** and trains on the remaining **459 observations**. This prevents obvious stock-limited sales from being interpreted as weak customer demand. The screen remains approximate because in-step stock transfers exist and the workbooks do not record lost customer orders.

## Demand model

The selected model is a small linear ridge regression. It uses these internal features:

- product;
- simulation run;
- a linear period trend;
- a separate absolute-price slope for each product; and
- price relative to the period's market-average price.

Run, period, and market price remain internal because they improve the historical specification but are not useful primary decision inputs. Browser predictions pool both simulations by averaging the fitted prediction over all usable historical run/period/market-price contexts for the selected product.

### Model comparison and validation

Candidate models were trained on earlier usable steps and evaluated on the final 20% of usable steps from each simulation.

| Candidate | Holdout MAE | Holdout RMSE | Holdout WAPE |
| --- | ---: | ---: | ---: |
| Product/period baseline | 42.2 units | 57.5 units | 62.2% |
| **Linear ridge regression** | **41.8 units** | **57.2 units** | **61.6%** |
| Log-linear ridge regression | 46.4 units | 65.2 units | 68.4% |

The linear ridge model had the best held-out result and was selected for its relative performance, stability, explainability, and small static-browser footprint. Its errors are still large, so the outputs are scenario estimates rather than precise forecasts.

A separate cross-run diagnostic trained on one simulation and tested on the other:

| Held-out simulation | MAE | RMSE | WAPE |
| --- | ---: | ---: | ---: |
| Regular | 42.4 units | 63.4 units | 67.9% |
| Extended | 61.4 units | 75.5 units | 128.9% |

Weak cross-run generalization is an important limitation and a reason to display ranges rather than a single certain-looking result.

## Low, expected, and high outcomes

The ranges come from genuine out-of-sample errors, not absolute historical minima or maxima:

1. Fit the selected specification on the earlier training steps.
2. Predict the chronologically held-out observations.
3. Calculate residuals as `actual demand − predicted demand`.
4. Use the held-out residual distribution's **20th percentile** for the low-sales adjustment and **80th percentile** for the high-sales adjustment.
5. Add those adjustments to the pooled central prediction, with demand floored at zero.

In the current model artifact, the adjustments are approximately −43.0 units and +25.0 units. These bounds describe historical simulation variability; they are not confidence guarantees.

For each demand outcome, the app applies inventory after predicting customer demand:

```text
Expected units sold = min(predicted customer demand, starting inventory)
Ending inventory    = max(0, starting inventory − expected units sold)
Revenue             = price × expected units sold
Contribution profit = (price − pooled weighted unit cost) × expected units sold
Contribution margin = contribution profit ÷ revenue
```

Variable unit cost is intentionally kept out of the primary interface. It is the pooled historical cost divided by pooled delivered units for the selected product.

## Current versus proposed results

Both current and proposed scenarios show:

- price;
- predicted customer demand;
- expected units sold after the inventory limit;
- ending inventory;
- revenue;
- contribution profit; and
- contribution margin.

The proposed-price callout reports expected profit change in euros and percentage terms. A separate table shows low-sales, expected, and high-sales outcomes, including minimum/expected/maximum ending inventory and projected profit.

## Price optimizer and chart

The optimizer evaluates 101 evenly spaced candidate prices between the selected product's historical minimum and maximum observed prices. For every candidate it calculates low, expected, and high demand; inventory-constrained sales; ending inventory; and contribution profit.

The recommendation maximizes **expected contribution profit** and also reports its plausible low-to-high profit range. The chart shows:

- expected contribution profit;
- a shaded low-to-high profit band;
- expected customer demand; and
- the expected-profit-maximizing price.

The optimizer never searches beyond the observed product range. A manually proposed price outside that range remains calculable, but the app displays:

> **Outside historical price range — this prediction is less reliable.**

No unsupported demand behavior is invented for distant prices.

## Static GitHub Pages deployment

Training is a development step only:

```bash
python3 scripts/train_model.py
node tests.js
```

The script exports coefficients, pooled prediction contexts, residual percentiles, defaults, validation metrics, and supported price ranges to `model-data.js`. The published page loads that artifact directly and requires no Python runtime, backend, API, credentials, or paid service.

To run locally:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Important limitations

- Historical prices were chosen by simulation participants, not randomly assigned. Price effects may include unmeasured strategy or timing differences.
- Stockout screening uses regional opening inventory and delivered units; in-step transfers and missing lost-order records limit identification of true unconstrained demand.
- Holdout and cross-run errors are large. Use the app to compare bounded classroom scenarios, not as a guaranteed sales forecast.
- A prediction represents total product demand for one simulation step across all three sales areas.
- Pooling historical contexts deliberately hides run-specific controls from the UI, but an average context may not represent a future simulation exactly.
- Recorded `COST` is treated as variable/attributable cost. Contribution profit is not whole-company accounting profit.
- Predictions outside the displayed historical price range are extrapolations and are explicitly flagged as less reliable.

## Company valuation review

The Company_Valuation sheets contain 50 sequential Regular observations and 81 Extended observations. Valuation has an approximately 0.80 within-file correlation with profit, but there are only two runs, observations are serially dependent, several financial fields are cumulative or mechanically related, and some variables have almost no within-run variation. That evidence is insufficient for an independently validated valuation objective, so the optimizer continues to maximize contribution profit.

## Project files

- `index.html` — simplified inputs, current/proposed comparison, outcome range, optimizer, and chart.
- `styles.css` — responsive presentation styling.
- `app.js` — pooled demand prediction, range construction, inventory calculations, optimization, and charting.
- `model-data.js` — generated coefficients, historical contexts, defaults, residual percentiles, validation metrics, and price bounds.
- `scripts/train_model.py` — reproducible data preparation, constraint screening, training, validation, and export.
- `tests.js` — dependency-free behavior and calculation tests.
- `data.js` — auditable reduced Sales export retained for historical inspection; the simplified browser does not load it.
- `Full_Data_Regular.xlsx` and `Full_Data_Extended.xlsx` — the only source workbooks.
