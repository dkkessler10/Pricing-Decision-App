#!/usr/bin/env python3
"""Train the static demand model from the two repository workbooks.

Uses only Python's standard library so the browser artifact can be reproduced
without a Python package installation.
"""
import json, math, re, statistics, zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [("Regular", ROOT / "Full_Data_Regular.xlsx"), ("Extended", ROOT / "Full_Data_Extended.xlsx")]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
PRODUCTS = ["Butter", "Cheese", "Cream", "Ice Cream", "Milk", "Yoghurt"]
PERIODS = list(range(1, 9))
RIDGE = 1.0


def workbook(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        strings = ["".join(t.text or "" for t in item.findall(".//m:t", NS)) for item in root.findall("m:si", NS)]
        book = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        result = {}
        for sheet in book.findall("m:sheets/m:sheet", NS):
            target = targets[sheet.attrib[f"{{{NS['r']}}}id"]]
            target = target.lstrip("/") if target.startswith("/") else f"xl/{target}" if not target.startswith("xl/") else target
            rows = []
            for row in ET.fromstring(archive.read(target)).findall(".//m:sheetData/m:row", NS):
                values = {}
                for cell in row.findall("m:c", NS):
                    column = re.match(r"[A-Z]+", cell.attrib["r"]).group()
                    value_node = cell.find("m:v", NS)
                    value = None if value_node is None else value_node.text
                    if value is not None:
                        if cell.attrib.get("t") == "s":
                            value = strings[int(value)]
                        else:
                            try:
                                value = float(value)
                            except ValueError:
                                pass
                    values[column] = value
                rows.append(values)
            result[sheet.attrib["name"]] = rows
        return result


def records(rows):
    columns = {value: column for column, value in rows[0].items()}
    return [{name: row.get(column) for name, column in columns.items()} for row in rows[1:]]


def build_panel():
    panel, contexts, source_counts = [], {}, {}
    for dataset, path in SOURCES:
        sheets = workbook(path)
        sales = records(sheets["Sales"])
        inventory = records(sheets["Inventory" if dataset == "Regular" else "Inventory (2)"])
        market = records(sheets["Market" if dataset == "Regular" else "Market (2)"])
        current = records(sheets["Current_Inventory" if dataset == "Regular" else "Current_Inventory (2)"])
        conditions = records(sheets["Current_Pricing_Conditions"])
        source_counts[dataset] = len(sales)

        sold = defaultdict(float)
        sold_by_area = defaultdict(float)
        for row in sales:
            key = (int(row["SIM_ELAPSED_STEPS"]), row["MATERIAL_DESCRIPTION"])
            sold[key] += row["QUANTITY_DELIVERED"]
            sold_by_area[key + (row["AREA"],)] += row["QUANTITY_DELIVERED"]
        available = defaultdict(float)
        available_by_area = defaultdict(float)
        area_codes = {"N": "North", "S": "South", "W": "West"}
        for row in inventory:
            key = (int(row["SIM_ELAPSED_STEPS"]), row["MATERIAL_DESCRIPTION"])
            opening = row["INVENTORY_OPENING_BALANCE"] or 0
            available[key] += opening
            area = area_codes.get(str(row["STORAGE_LOCATION"])[-1:])
            if area:
                available_by_area[key + (area,)] += opening
        market_values = defaultdict(list)
        for row in market:
            market_values[(int(row["SIM_PERIOD"]), row["MATERIAL_DESCRIPTION"])].append((row["AVERAGE_PRICE"], row["QUANTITY"]))
        sales_prices = defaultdict(list)
        for row in sales:
            sales_prices[(int(row["SIM_ELAPSED_STEPS"]), row["MATERIAL_DESCRIPTION"])].append(row["NET_PRICE"])

        steps = sorted({key[0] for key in available})
        first_sale, last_sale = min(key[0] for key in sold), max(key[0] for key in sold)
        for step in [value for value in steps if first_sale <= value <= last_sale]:
            period = (step - 1) // 10 + 1
            for product in PRODUCTS:
                historical = [(s, statistics.median(prices)) for (s, p), prices in sales_prices.items() if p == product and s <= step]
                future = [(s, statistics.median(prices)) for (s, p), prices in sales_prices.items() if p == product]
                price = max(historical)[1] if historical else min(future)[1]
                market_rows = market_values.get((period, product), [])
                market_quantity = sum(quantity for _, quantity in market_rows)
                market_price = (sum(price_value * quantity for price_value, quantity in market_rows) / market_quantity) if market_quantity else price
                units = sold[(step, product)]
                stock = available[(step, product)]
                constrained = any(
                    sold_by_area[(step, product, area)] > 0
                    and available_by_area[(step, product, area)] <= sold_by_area[(step, product, area)] * 1.05
                    for area in ("North", "South", "West")
                )
                panel.append({"dataset": dataset, "step": step, "period": period, "product": product, "price": price,
                              "marketPrice": market_price, "marketQuantity": market_quantity, "inventory": stock,
                              "units": units, "constrained": constrained})

        current_stock = defaultdict(float)
        for row in current:
            current_stock[row["MATERIAL_DESCRIPTION"]] += row["STOCK"] or 0
        current_price = {row["MATERIAL_DESCRIPTION"]: row["PRICE"] for row in conditions}
        latest_period = max(int(row["SIM_PERIOD"]) for row in market)
        for product in PRODUCTS:
            latest_market = market_values[(latest_period, product)]
            quantity = sum(item[1] for item in latest_market)
            contexts[f"{dataset}|{product}"] = {
                "period": latest_period,
                "inventory": current_stock[product],
                "currentPrice": current_price[product],
                "marketPrice": sum(item[0] * item[1] for item in latest_market) / quantity,
            }
    return panel, contexts, source_counts


def features(row):
    values = [1]
    values += [1 if row["product"] == product else 0 for product in PRODUCTS[1:]]
    values += [1 if row["dataset"] == "Extended" else 0]
    values += [row["period"]]
    values += [row["price"] if row["product"] == product else 0 for product in PRODUCTS]
    values += [row["price"] / row["marketPrice"]]
    return values


def solve(matrix, vector, penalty=RIDGE):
    size = len(vector)
    for index in range(1, size):
        matrix[index][index] += penalty
    for index in range(size):
        pivot = max(range(index, size), key=lambda row: abs(matrix[row][index]))
        matrix[index], matrix[pivot] = matrix[pivot], matrix[index]
        vector[index], vector[pivot] = vector[pivot], vector[index]
        divisor = matrix[index][index]
        if abs(divisor) < 1e-12:
            continue
        for column in range(index, size):
            matrix[index][column] /= divisor
        vector[index] /= divisor
        for row in range(size):
            if row == index:
                continue
            multiplier = matrix[row][index]
            for column in range(index, size):
                matrix[row][column] -= multiplier * matrix[index][column]
            vector[row] -= multiplier * vector[index]
    return vector


def fit(rows, log_target=False, include_price=True):
    vectors = [features(row) if include_price else features(row)[:-7] for row in rows]
    targets = [math.log1p(row["units"]) if log_target else row["units"] for row in rows]
    size = len(vectors[0])
    matrix = [[sum(vector[i] * vector[j] for vector in vectors) for j in range(size)] for i in range(size)]
    vector = [sum(row[i] * target for row, target in zip(vectors, targets)) for i in range(size)]
    coefficients = solve(matrix, vector)
    def predict(row):
        estimate = sum(value * coefficient for value, coefficient in zip(features(row) if include_price else features(row)[:-7], coefficients))
        return max(0, math.expm1(estimate) if log_target else estimate)
    return coefficients, predict


def metrics(rows, predict):
    errors = [abs(predict(row) - row["units"]) for row in rows]
    squared = [(predict(row) - row["units"]) ** 2 for row in rows]
    return {"mae": sum(errors) / len(errors), "rmse": math.sqrt(sum(squared) / len(squared)),
            "wape": sum(errors) / sum(row["units"] for row in rows), "observations": len(rows)}


def main():
    panel, contexts, source_counts = build_panel()
    eligible = [row for row in panel if not row["constrained"]]
    training = [row for row in eligible if row["step"] <= (40 if row["dataset"] == "Regular" else 64)]
    holdout = [row for row in eligible if row not in training]
    candidates = {}
    for name, log_target, include_price in [("product-period baseline", False, False), ("linear ridge", False, True), ("log-linear ridge", True, True)]:
        _, prediction = fit(training, log_target, include_price)
        candidates[name] = metrics(holdout, prediction)
    cross_run = {}
    for held_out in ["Regular", "Extended"]:
        _, prediction = fit([row for row in eligible if row["dataset"] != held_out])
        cross_run[held_out] = metrics([row for row in eligible if row["dataset"] == held_out], prediction)
    coefficients, _ = fit(eligible)
    ranges = {}
    for product in PRODUCTS:
        rows = [row for row in panel if row["product"] == product]
        ranges[product] = {"minimum": min(row["price"] for row in rows), "maximum": max(row["price"] for row in rows)}
    output = {"version": 1, "target": "total product units per simulation step", "products": PRODUCTS, "periods": PERIODS,
              "coefficients": coefficients, "ridgePenalty": RIDGE, "trainingObservations": len(eligible),
              "excludedConstrained": len(panel) - len(eligible), "totalObservations": len(panel), "validation": candidates,
              "crossRunValidation": cross_run, "priceRanges": ranges, "contexts": contexts, "sourceSalesRows": source_counts}
    destination = ROOT / "model-data.js"
    destination.write_text("// Generated by scripts/train_model.py from the two current workbooks.\nwindow.DEMAND_MODEL = " + json.dumps(output, separators=(",", ":")) + ";\n")
    print(json.dumps({"selected": candidates["linear ridge"], "candidates": candidates, "crossRun": cross_run,
                      "training": len(eligible), "excluded": len(panel) - len(eligible)}, indent=2))

if __name__ == "__main__":
    main()
