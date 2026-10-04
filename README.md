# Pricing Decision Desk — Version 1

A presentation-ready, browser-based calculator for exploring how a proposed product price could affect demand and contribution profit. The historical layer is built **only** from the Sales worksheets in `Full_Data_Regular.xlsx` and `Full_Data_Extended.xlsx`; price elasticity remains a clearly labeled, user-controlled assumption. The application uses only HTML, CSS, and JavaScript and has no package or build dependencies.

## Historical data review

### Current source files

The repository contains two simulation exports:

- `Full_Data_Regular.xlsx` is the Regular scenario. Its Sales worksheet contains **692 sales lines**, spanning elapsed simulation steps 3–50.
- `Full_Data_Extended.xlsx` is the Extended scenario. Its Sales worksheet contains **681 sales lines**, spanning elapsed simulation steps 5–80.

Both Sales worksheets have the same fields needed by the pricing analysis: product, area, delivered quantity, net price, net value, cost, currency, and simulation keys. `data.js` is a reduced export of all **1,373** Sales rows. Each embedded row retains a `dataset` label (`Regular` or `Extended`) so its origin remains auditable.

The browser pools the two scenarios for product defaults and nearest-price benchmarks. Pooling supplies the broadest descriptive history without treating either simulation as a causal experiment. The product helper text also shows how many selected-product rows came from each file.

Other workbook sheets contain inventory, purchasing, market, company-valuation, and operational data. They provide useful simulation context but do not establish a controlled price/demand relationship, so they are not included in the browser's pricing calculations.

### Regular versus Extended

| Dataset | Sales lines | Delivered units | Revenue | Recorded cost | Contribution | Contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Regular | 692 | 26,311 | €1,164,320.57 | €1,060,975.86 | €103,344.71 | 8.88% |
| Extended | 681 | 27,213 | €1,164,845.82 | €1,004,966.81 | €159,879.01 | 13.73% |
| **Combined app history** | **1,373** | **53,524** | **€2,329,166.39** | **€2,065,942.67** | **€263,223.72** | **11.30%** |

The Extended scenario has similar revenue but higher delivered volume and contribution than Regular. That difference is descriptive: the files represent different simulation scenarios and time horizons, so it should not be attributed to price alone.

Across both Sales worksheets:

- `NET_VALUE = NET_PRICE × QUANTITY_DELIVERED` to cent-level precision.
- `QUANTITY` equals `QUANTITY_DELIVERED` on every sales line, so the app uses delivered quantity as historical units.
- Contribution is calculated as `NET_VALUE − COST` because the current exports do not contain a separate `Margin` column.
- Historical unit cost varies within products. The editable cost default is therefore total pooled cost divided by total pooled delivered units for the selected product.

### Combined product benchmarks and defaults

| Product | Sales lines | Distinct prices | Observed price range | Delivered units | Default current price | Default current units | Weighted avg. unit cost | Contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Butter | 245 | 9 | €64.57–€70.86 | 6,346 | €70.86 | 27 | €60.57 | 8.83% |
| Cheese | 231 | 10 | €89.67–€99.13 | 4,414 | €99.13 | 20 | €83.64 | 8.88% |
| Cream | 160 | 8 | €74.02–€85.38 | 3,526 | €85.38 | 23 | €72.80 | 6.28% |
| Ice Cream | 149 | 11 | €47.25–€50.00 | 4,841 | €50.00 | 35 | €43.63 | 9.59% |
| Milk | 312 | 11 | €25.25–€29.35 | 19,132 | €29.35 | 66 | €23.25 | 15.04% |
| Yoghurt | 276 | 10 | €28.43–€34.07 | 15,265 | €34.07 | 59.5 | €26.18 | 15.21% |

The default current price is the highest observed pooled price, default current units are the median delivered units per pooled sales line, and default cost is the pooled weighted average described above. These are convenient starting points, not forecasts.

### Elasticity assessment

Although the two files provide multiple observed prices per product, they still do **not** support a reliable fitted price elasticity:

- Prices occur in a small number of scenario-specific clusters rather than randomized or otherwise controlled price changes.
- Price changes are entangled with elapsed simulation step, scenario, area, inventory availability, order composition, and other team decisions.
- The two files have different scenario rules and time horizons. Pooling them in a demand regression would risk assigning scenario differences to price.
- A sales line is an order line, not a stable product-period demand observation; its quantity can change with the number and composition of orders.

Consequently, the application does not fit or display an elasticity from the workbooks. The user must enter a negative elasticity assumption, and optimized results remain labeled **scenario-based estimates, not predictions**. The closest-price benchmark is strictly descriptive.

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

1. Choose one of the six products. The form loads pooled defaults based on both current workbooks and displays the Regular/Extended line counts.
2. Enter the **current** price and current units. These establish the demand baseline.
3. Enter the **proposed** price.
4. Enter a negative **price elasticity of demand** assumption. For example, `-1.5` means that a 1% price increase is associated with approximately a 1.5% decrease in units for a small price change. The exact constant-elasticity formula is used for the calculation.
5. Review the variable cost per unit and change it if the simulation provides a better forward-looking cost.
6. Select **Compare scenarios**. The app also updates automatically as valid inputs change.
7. Review the profit-impact comparison, the pooled closest-price benchmark, and the Price Optimizer. The chart shows price on the X-axis and projected contribution profit on the Y-axis.

Blank, nonnumeric, negative, and zero-price values are rejected with field-specific messages. Elasticity must be negative and no lower than `-10`. Zero units and zero cost are allowed because they can be valid simulation scenarios.

## Calculation method

For both current and proposed scenarios:

```text
Expected new units  = current units × (proposed price ÷ current price) ^ elasticity
Revenue             = price × calculated units
Contribution profit = (price − variable cost per unit) × calculated units
Margin percentage   = contribution profit ÷ revenue
Change in profit    = proposed contribution profit − current contribution profit
```

The benchmark finds the selected product's observed price nearest to the proposed price across both datasets, then reports the matching sales-line count, median delivered units per line, and aggregate contribution margin (`sum(NET_VALUE − COST) ÷ sum(NET_VALUE)`).

The Price Optimizer evaluates 301 evenly spaced prices from **50% to 200% of the current price**. At every price it recalculates units using the selected constant elasticity and then calculates contribution profit. It returns the highest-profit evaluated scenario and plots the full profit curve. The bounded range prevents a weak elasticity assumption from producing an unlimited recommended price; a boundary result is a signal to test assumptions, not proof that the boundary is optimal in the real market.

## Assumptions and limitations

- `COST` behaves like a variable/attributable sales cost for scenario contribution analysis. This is contribution profit, not whole-company accounting profit.
- Price, cost, revenue, and profit are in EUR, and `ST` represents one unit.
- Current units supplied by the user represent demand at the current price and are deliverable; the app does not constrain calculated units by inventory or logistics capacity.
- A constant-elasticity relationship is a user assumption. The same response is applied throughout the bounded 50%–200% optimizer range.
- Unit cost stays constant as volume and price change unless the user edits it.
- A sales line is the comparison unit for median order volume; it is not a full period's demand.
- The datasets cannot identify a robust causal elasticity because prices, scenarios, time, and operational decisions vary together.
- The workbooks do not separate all fixed and variable costs. Treating recorded sales cost as variable is useful for a classroom scenario, not a full P&L forecast.
- The nearest-price benchmark is descriptive and does not claim the proposed scenario will reproduce historical volume or margin.
- The optimizer is highly sensitive to elasticity and cost assumptions and does not model taxes, discounts, capacity, spoilage, stockouts, or cross-product effects.
- The app is static: if either workbook changes, `data.js` and the documented summaries must be regenerated.

## Project files

- `index.html` — semantic application structure and current-source labels.
- `styles.css` — responsive presentation styling.
- `app.js` — validation, calculations, pooled historical summaries, and UI behavior.
- `data.js` — reduced combined Sales data from the Regular and Extended files.
- `tests.js` — dependency-free checks for calculations, validation, and current-data defaults.
- `Full_Data_Regular.xlsx` — Regular simulation source workbook.
- `Full_Data_Extended.xlsx` — Extended simulation source workbook.
