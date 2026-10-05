# Pricing Decision Desk — Version 2

A static, browser-based pricing tool that predicts product demand, inventory-constrained sales, ending inventory, lost sales, revenue, and contribution profit from `Full_Data_Regular.xlsx` and `Full_Data_Extended.xlsx`. Model training happens offline with a dependency-free Python script; GitHub Pages only loads exported JavaScript parameters and does not require a server or paid service.

## Data preparation

`scripts/train_model.py` reads the workbooks directly as ZIP/XML files and builds a product-by-simulation-step panel. The analytical unit is total demand for one product across all three sales areas in one simulation step.

The pipeline uses:

- **Sales** for delivered units, own price, revenue, cost, product, area, channel, period, and simulation step;
- **Inventory / Inventory (2)** for opening stock by product, step, storage location, and area;
- **Market / Market (2)** for quantity-weighted market average price by product and period;
- **Current Inventory** for the scenario's default available-inventory input;
- **Current Pricing Conditions** for the default proposed price; and
- the workbook/run identity and period as model controls.

The two Sales worksheets contribute 692 Regular and 681 Extended sales lines. Aggregation produces 744 product-step observations before inventory screening.

### Demand versus realized sales

Delivered units can understate customer demand when stock is unavailable. For each product-step, the pipeline compares delivered units in North, South, and West with the corresponding regional opening inventory. It flags an observation when a region has positive sales and opening inventory is no more than 105% of delivered units. This conservative rule removes **285 potentially inventory-constrained observations** rather than teaching the model that constrained sales represent low demand. The remaining **459 observations** train the final model.

This screen is imperfect because stock transfers can occur within a step and the workbooks do not contain lost-order or unconstrained-demand records. Predictions therefore remain model estimates, not direct measurements of latent customer demand.

## Model selection

Three intentionally simple approaches were compared on the same chronological holdout. The final 20% of usable steps in each simulation were held out; earlier observations were used for candidate training.

| Candidate | Holdout MAE | Holdout RMSE | Holdout WAPE |
| --- | ---: | ---: | ---: |
| Product/period baseline | 42.2 units | 57.5 units | 62.2% |
| **Linear ridge regression** | **41.8 units** | **57.2 units** | **61.6%** |
| Log-linear ridge regression | 46.4 units | 65.2 units | 68.4% |

The linear ridge model was selected because it performed best on all three holdout metrics and remains explainable. It predicts units from:

- product indicators;
- simulation dataset/run;
- a linear period trend;
- a separate own-price slope for each product; and
- own price relative to the quantity-weighted market price.

The model is refit on all 459 usable observations after selection. Ridge regularization uses a penalty of 1.0 to reduce instability among correlated price features. `model-data.js` contains the fitted coefficients, validation metadata, context defaults, and observed price bounds used by the browser.

### Cross-run check

As a harder diagnostic, the same linear specification was trained on one simulation and evaluated on the other:

| Held-out simulation | MAE | RMSE | WAPE |
| --- | ---: | ---: | ---: |
| Regular | 42.4 units | 63.4 units | 67.9% |
| Extended | 61.4 units | 75.5 units | 128.9% |

Generalization across runs is weak, especially by WAPE on Extended. This is prominently reflected in the app's uncertainty language. The model is useful for structured classroom scenario comparison, not precise demand forecasting.

## Browser calculations

For the selected product, simulation context, period, proposed price, and market average price, the exported model predicts unconstrained customer demand for one simulation step. The app then applies the user's available inventory:

```text
Predicted demand  = max(0, fitted linear model output)
Expected sales    = min(predicted demand, available inventory)
Ending inventory  = max(0, available inventory − expected sales)
Estimated lost sales = max(0, predicted demand − available inventory)
Revenue           = proposed price × expected sales
Contribution profit = (proposed price − variable cost per unit) × expected sales
Margin            = contribution profit ÷ revenue
```

Available inventory, market price, and unit cost remain editable because they are scenario facts rather than fitted behavioral parameters. Their defaults come from the selected workbook's current inventory, latest market period, and historical weighted cost.

## Price optimizer and chart

The optimizer evaluates 101 evenly spaced candidate prices between the selected product's minimum and maximum observed prices across both workbooks. It predicts demand at every candidate, caps sales at available inventory, and recommends the candidate with the highest projected contribution profit. Keeping the search inside observed bounds prevents distant price extrapolation.

The chart overlays:

- projected contribution profit on the left axis; and
- predicted customer demand on the right axis.

The highlighted point is the profit-maximizing candidate within the historical price range. Profit remains the objective; no company-valuation target is used.

## Company valuation review

The Company_Valuation data was inspected for a possible later extension:

- Regular provides 50 sequential observations and Extended provides 81.
- Both contain company valuation, profit, cash, receivables, loans, payables, debt loading, risk rates, and credit rating.
- The within-file correlation between valuation and profit is approximately 0.80 in each simulation, so there is a visible association worth studying.
- However, there are only two simulation runs, observations are serially dependent, several financial variables are cumulative or mechanically related, and some fields have little variation (Regular payables are always zero; Extended loans are always zero).
- A random row split would therefore overstate validation quality, while holding out one of only two runs is not enough to establish generalization or rule out formula leakage.

The data is suitable for exploratory analysis and for designing a future valuation model, but it is **not sufficient to independently validate a valuation objective**. Contribution profit remains the optimizer objective.

## Run and reproduce

Run the static site:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Regenerate the model artifact after either workbook changes:

```bash
python3 scripts/train_model.py
node tests.js
```

The training script requires only Python's standard library. The published page loads `data.js`, `model-data.js`, and `app.js` directly in the browser.

## Important limitations

- Historical prices were chosen by simulation participants rather than randomly assigned, so price coefficients can still reflect unmeasured strategy and timing differences.
- The model controls for product, dataset, period, and market price, but it cannot capture promotions, competitors, customer identity, service levels, or all inventory movements.
- Stockout screening uses opening regional inventory and delivered units; in-step transfers and unavailable lost-order records limit how precisely constrained demand can be identified.
- Validation errors are large, and cross-run performance is weak. Use estimates to compare bounded scenarios, not as guaranteed forecasts.
- A prediction covers one simulation step across all sales areas. It is not an order-line or full-game forecast.
- Recorded `COST` is treated as variable/attributable cost; contribution profit is not whole-company accounting profit.
- Candidate prices remain inside historical product bounds, but sparse observations within those bounds still make some interpolations uncertain.

## Project files

- `index.html` — static model inputs, projections, optimizer, and chart.
- `styles.css` — responsive presentation styling.
- `app.js` — browser prediction, inventory constraint, profit calculation, optimization, and charting.
- `data.js` — reduced combined historical Sales rows used for cost defaults.
- `model-data.js` — generated model coefficients, validation metrics, contexts, and price bounds.
- `scripts/train_model.py` — reproducible workbook preparation, stockout screening, training, validation, and export.
- `tests.js` — dependency-free model and browser-calculation tests.
- `Full_Data_Regular.xlsx` and `Full_Data_Extended.xlsx` — the only source workbooks.
