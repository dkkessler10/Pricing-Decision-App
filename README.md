# Pricing Decision Desk — Version 1

A presentation-ready, browser-based calculator for comparing a current and proposed product price scenario against the historical sales contained in `Full Data_0924.xlsx`. The application uses only HTML, CSS, and JavaScript and has no package or build dependencies.

## Historical data review

### What is in the workbook

The workbook contains 11 sheets. The pricing analysis uses the **Sales** sheet because it is the only row-level table that joins price, delivered units, revenue, cost, and margin. Its 173 sales lines cover simulation steps 5–30, six dairy products, three sales areas (North, South, and West), one distribution channel, and EUR currency.

The Sales columns are:

| Group | Columns |
| --- | --- |
| Row and simulation keys | `ID`, `ROW_ID`, `SALES_ORGANIZATION`, `SIM_ROUND`, `SIM_STEP`, `SIM_DATE`, `SIM_PERIOD`, `SIM_ELAPSED_STEPS` |
| Order and location | `SALES_ORDER_NUMBER`, `LINE_ITEM`, `STORAGE_LOCATION`, `AREA`, `DISTRIBUTION_CHANNEL` |
| Product | `MATERIAL_NUMBER`, `MATERIAL_DESCRIPTION` |
| Units and price | `QUANTITY`, `QUANTITY_DELIVERED`, `UNIT`, `NET_PRICE` |
| Financial outcomes | `NET_VALUE`, `COST`, `CURRENCY`, `Margin` |

Other workbook sheets provide margin and sales pivots, historical and current inventory, company valuation, financial postings, and current-inventory KPIs. They are useful operational context, but they do not add a defensible causal price/demand relationship, so V1 does not mix them into its pricing calculation.

### Useful relationships found

Across the 173 Sales rows:

- Delivered volume is **6,803 units**, revenue is **€293,903.96**, recorded cost is **€245,849.20**, and contribution (`Margin`) is **€48,054.76**, or **16.35% of revenue**.
- Every row satisfies `NET_VALUE = NET_PRICE × QUANTITY_DELIVERED` to cent-level precision.
- Every row satisfies `Margin = NET_VALUE − COST` to cent-level precision.
- `QUANTITY` equals `QUANTITY_DELIVERED` on every row, so V1 uses delivered quantity as the historical units measure.
- Historical unit cost varies slightly within each product. The app therefore uses total historical cost divided by total delivered units for the selected product as its editable default variable cost.

| Product | Sales lines | Observed prices | Delivered units | Weighted avg. unit cost | Contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Butter | 30 | €68.44, €70.86 | 738 | €60.89 | 11.30% |
| Cheese | 22 | €96.40, €99.13 | 436 | €84.39 | 13.09% |
| Cream | 14 | €80.68, €85.38 | 308 | €73.19 | 9.95% |
| Ice Cream | 15 | €50.00 | 494 | €43.85 | 12.30% |
| Milk | 48 | €29.35 | 2,600 | €23.51 | 19.89% |
| Yoghurt | 44 | €32.76, €34.07 | 2,227 | €26.39 | 21.48% |

Price has too little variation to support a reliable demand curve: Milk and Ice Cream have only one observed price, while the other products have only two. Where two prices exist, higher-price rows generally have lower average units per line, most visibly for Cheese (21.6 units at €96.40 versus 16.0 at €99.13). This is an association—not evidence that price caused the difference—because area, time, order mix, inventory availability, and other simulation decisions may also differ. For that reason, V1 asks the user to supply expected units instead of generating a false demand forecast.

## Run the app

### Start

1. Open a terminal in this repository.
2. Start a static web server:

   ```bash
   python3 -m http.server 8000
   ```

3. Open **http://localhost:8000** in a browser.

Opening `index.html` directly also works in most modern browsers, but the local server is the recommended and repeatable presentation method.

### Use

1. Choose one of the six products. The form loads the product's highest observed price, median units per historical sales line, and weighted historical unit cost as convenient starting values.
2. Enter the **current** price and expected units.
3. Enter the **proposed** price and expected units. Expected volume is your scenario assumption; the app does not claim to predict demand.
4. Review the variable cost per unit and change it if the simulation provides a better forward-looking cost.
5. Select **Compare scenarios**.
6. Present the profit-impact callout, the side-by-side metrics, and the closest observed historical price benchmark. If the proposed price was never observed, the benchmark explicitly says it is only the nearest price.

Blank, nonnumeric, negative, and zero-price values are rejected with field-specific messages. Zero units and zero cost are allowed because they can be valid simulation scenarios.

### Stop

Return to the terminal running the server and press **Ctrl+C**. The page can then be closed.

## Calculation method

For both current and proposed scenarios:

```text
Revenue             = price × expected units
Contribution profit = (price − variable cost per unit) × expected units
Margin percentage   = contribution profit ÷ revenue
Change in profit    = proposed contribution profit − current contribution profit
```

The benchmark finds the selected product's observed price nearest to the proposed price, then reports the number of matching historical sales lines, their median delivered units per line, and their aggregate contribution margin (`sum(Margin) ÷ sum(NET_VALUE)`).

## Assumptions

- `COST` behaves like a variable/attributable sales cost for scenario contribution analysis. The workbook calls the residual `Margin`; V1 labels it contribution profit to distinguish it from whole-company accounting profit.
- Price, cost, revenue, and profit are in EUR, and `ST` represents one unit.
- Expected units supplied by the user are deliverable; V1 does not constrain them by inventory or logistics capacity.
- Unit cost stays constant as volume and price change unless the user edits it.
- A historical sales line is the comparison unit for median order volume; it is not a full period's demand.
- The embedded `data.js` is a faithful, reduced export of the 173 Sales rows containing only the fields needed by the browser app.

## Limitations

- There are only 173 lines from one simulation round and 26 observed steps; this is not enough to generalize confidently.
- The dataset has one or two price points per product, so it cannot identify a robust price elasticity or predict demand at a new price.
- Sales-line volume may be affected by region, time, customer/order composition, inventory constraints, competitor actions, promotion, and simulation choices not controlled in this analysis.
- The workbook does not separate all fixed and variable costs. Treating recorded sales cost as variable is useful for a classroom scenario, not a full P&L forecast.
- The nearest-price benchmark is descriptive. It does not claim the proposed scenario will reproduce past volume or margin.
- V1 does not model taxes, discounts, service levels, capacity, spoilage, stockouts, or cross-product effects.
- The app is static: when the workbook changes, `data.js` must be regenerated before the browser reflects those changes.

## Project files

- `index.html` — semantic application structure.
- `styles.css` — responsive presentation styling.
- `app.js` — validation, calculations, historical summaries, and UI behavior.
- `data.js` — reduced historical Sales data used by the browser.
- `tests.js` — dependency-free checks for the calculation and validation functions.
- `Full Data_0924.xlsx` — original source workbook.
