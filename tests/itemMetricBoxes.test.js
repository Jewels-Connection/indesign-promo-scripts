const assert = require("assert");
const fs = require("fs");
const path = require("path");
require.extensions[".jsx"] = require.extensions[".js"];

const {
  applyItemMetricBoxesToRows,
  buildItemMetricRowsForText,
  buildMetricBoxPlans,
  formatMetricValue,
  getCenteredMetricBoxStartX,
  getClampedMetricBoxStartX,
  getItemMetricApplyDoScriptSource,
  getItemMetricApplyDecision,
  isGeneratedItemMetricBox,
  normalizeItemRoot,
  parseItemMetricCsv,
} = require("../Item Metric Boxes.jsx");

const csv = [
  "ItemRoot,Last365DaysSales,UnitsLast365,CountOnHand,ItemAvgWeight",
  "203281,124,11,8,3.4200",
  "11359,23,2,4,2.70",
  "11359-N,44,5,2,1.10",
  "18418,21,1,41,0.50",
  "10219,1000,200,25,2.00",
].join("\n");

const metrics = parseItemMetricCsv(csv);

assert.strictEqual(metrics.errors.length, 0);
assert.strictEqual(metrics.validRows.length, 5);
assert.strictEqual(metrics.recordsByRoot["203281"].itemAvgWeight, "3.42");
assert.strictEqual(metrics.recordsByRoot["203281"].unitsLast365, "11");
assert.strictEqual(metrics.recordsByRoot["10219"].itemAvgWeight, "2");

const aliasMetrics = parseItemMetricCsv([
  "Item Root,DollarsLast365,Units Sold Last 365,On Hand,Average Weight",
  "203281,124,11,8,3.42",
].join("\n"));
assert.strictEqual(aliasMetrics.errors.length, 0);
assert.strictEqual(aliasMetrics.recordsByRoot["203281"].last365DaysSales, "124");
assert.strictEqual(aliasMetrics.recordsByRoot["203281"].unitsLast365, "11");

const missingUnitsMetrics = parseItemMetricCsv([
  "ItemRoot,Last365DaysSales,CountOnHand,ItemAvgWeight",
  "203281,124,8,3.42",
].join("\n"));
assert.strictEqual(missingUnitsMetrics.errors.length, 1);
assert.strictEqual(missingUnitsMetrics.errors[0].indexOf("UnitsLast365") !== -1, true);

assert.strictEqual(formatMetricValue(" 003.4200 "), "003.42");
assert.strictEqual(formatMetricValue("5.00"), "5");
assert.strictEqual(formatMetricValue("1,250"), "1,250");

assert.strictEqual(normalizeItemRoot("#203281-7"), "203281");
assert.strictEqual(normalizeItemRoot("203281-7.5"), "203281");
assert.strictEqual(normalizeItemRoot("10219-6-8"), "10219");
assert.strictEqual(normalizeItemRoot("11359-N"), "11359-N");
assert.strictEqual(normalizeItemRoot("# 12618"), "12618");

let rows = buildItemMetricRowsForText("6\u201D $1,11996 REGALO B #203281", metrics, {
  page: "1",
  textFrame: "Box A",
  layer: "Jewelry",
});
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].status, "OK");
assert.strictEqual(rows[0].itemNumber, "203281");
assert.strictEqual(rows[0].itemRoot, "203281");
assert.strictEqual(rows[0].last365DaysSales, "124");
assert.strictEqual(rows[0].unitsLast365, "11");
assert.strictEqual(rows[0].countOnHand, "8");
assert.strictEqual(rows[0].itemAvgWeight, "3.42");

rows = buildItemMetricRowsForText("#11359-N", metrics, {
  page: "2",
  textFrame: "Box B",
  layer: "Jewelry",
});
assert.strictEqual(rows[0].status, "OK");
assert.strictEqual(rows[0].itemRoot, "11359-N");
assert.strictEqual(rows[0].last365DaysSales, "44");

rows = buildItemMetricRowsForText("#18418-APR", metrics, {
  page: "2",
  textFrame: "Box Month",
  layer: "Jewelry",
});
assert.strictEqual(rows[0].status, "OK");
assert.strictEqual(rows[0].itemRoot, "18418");
assert.strictEqual(rows[0].notes, "Used base item root fallback from 18418-APR");
assert.strictEqual(rows[0].last365DaysSales, "21");

rows = buildItemMetricRowsForText("#99999-6", metrics, {
  page: "3",
  textFrame: "Box C",
  layer: "Jewelry",
});
assert.strictEqual(rows[0].status, "MISSING_METRIC_DATA");
assert.strictEqual(rows[0].itemRoot, "99999");

let plans = buildMetricBoxPlans({ x: 100, y: 200, page: "1" }, metrics.recordsByRoot["203281"]);
assert.deepStrictEqual(
  plans.map((plan) => [plan.kind, plan.text, plan.fillSwatchName]),
  [
    ["StackedMetrics", "$124 / 11\r8\r3.42", "Metric Background White"],
  ]
);
assert.deepStrictEqual(plans[0].geometricBounds, [200, 100, 231, 157]);
assert.strictEqual(plans[0].geometricBounds[3] - plans[0].geometricBounds[1], 57);
assert.strictEqual(plans[0].textSwatchNames.join("|"), "Metric Sales Blue|Metric On Hand Green|Metric Weight Red");
assert.strictEqual(getCenteredMetricBoxStartX(100, 156, metrics.recordsByRoot["203281"]), 99.5);
assert.strictEqual(getCenteredMetricBoxStartX(560, 600, metrics.recordsByRoot["203281"], { left: 0, right: 612 }), 551.5);

const maxMetricRecord = {
  last365DaysSales: "$123,456",
  unitsLast365: "999",
  countOnHand: "999",
  itemAvgWeight: "12.34",
};
const maxPlans = buildMetricBoxPlans({ x: 0, y: 0 }, maxMetricRecord);
assert.deepStrictEqual(maxPlans.map((plan) => plan.geometricBounds[3] - plan.geometricBounds[1]), [87]);
assert.strictEqual(maxPlans[0].geometricBounds[3] - maxPlans[0].geometricBounds[1], 87);
assert.strictEqual(getCenteredMetricBoxStartX(560, 600, maxMetricRecord, { left: 0, right: 612 }), 525);
assert.strictEqual(getClampedMetricBoxStartX(-20, 87, { left: 0, right: 612 }), 0);
assert.strictEqual(getClampedMetricBoxStartX(580, 87, { left: 0, right: 612 }), 525);

assert.strictEqual(getItemMetricApplyDecision("OK", 0, 0), "APPLY");
assert.strictEqual(getItemMetricApplyDecision("OK", 9, 10), "APPLY");
assert.strictEqual(getItemMetricApplyDecision("OK", 10, 10), "SKIPPED_LIMIT");
assert.strictEqual(getItemMetricApplyDecision("MISSING_METRIC_DATA", 0, 10), "SKIPPED_MISSING_METRIC_DATA");
assert.strictEqual(getItemMetricApplyDoScriptSource(10).indexOf("ITEM_METRIC_BOX_APPLY_LIMIT"), -1);
assert.strictEqual(getItemMetricApplyDoScriptSource(10).indexOf("ITEM_METRIC_BOX_PENDING_ROWS, 10)") !== -1, true);

const sampleWrapperSource = fs.readFileSync(path.join(__dirname, "..", "Apply Item Metric Boxes Sample.jsx"), "utf8");
assert.strictEqual(sampleWrapperSource.indexOf("ITEM_METRIC_BOX_APPLY_LIMIT"), -1);
assert.strictEqual(sampleWrapperSource.indexOf("applyItemMetricBoxesMain(10)") !== -1, true);

const fullApplyWrapperSource = fs.readFileSync(path.join(__dirname, "..", "Apply Item Metric Boxes.jsx"), "utf8");
assert.strictEqual(fullApplyWrapperSource.indexOf("ITEM_METRIC_BOX_APPLY_LIMIT"), -1);
assert.strictEqual(fullApplyWrapperSource.indexOf("applyItemMetricBoxesMain(10)"), -1);
assert.strictEqual(fullApplyWrapperSource.indexOf("applyItemMetricBoxesMain()") !== -1, true);

assert.strictEqual(isGeneratedItemMetricBox({ label: "CATALOG_ITEM_METRIC_BOX|123" }), true);
assert.strictEqual(isGeneratedItemMetricBox({ label: "", itemLayer: { name: "Catalog Item Metric Boxes" } }), true);
assert.strictEqual(isGeneratedItemMetricBox({ label: "", itemLayer: { name: "Jewelry" } }), false);

const createdFrames = [];
const mockLayer = { name: "Catalog Item Metric Boxes", isValid: true };
const mockPage = {
  textFrames: {
    add: () => {
      const paragraphs = [
        { pointSize: null, leading: null, justification: null, fillColor: null, fontStyle: null },
        { pointSize: null, leading: null, justification: null, fillColor: null, fontStyle: null },
        { pointSize: null, leading: null, justification: null, fillColor: null, fontStyle: null },
      ];
      const frame = {
        textFramePreferences: {},
        texts: [{ pointSize: null, leading: null, justification: null, fillColor: null, fontStyle: null }],
        paragraphs,
        label: "",
        contents: "",
      };
      createdFrames.push(frame);
      return frame;
    },
  },
};
const mockDoc = {
  pageItems: [],
  layers: {
    itemByName: () => mockLayer,
    add: () => mockLayer,
  },
  colors: {
    itemByName: (name) => ({ name, isValid: true }),
    add: () => ({ isValid: true }),
  },
  swatches: {
    itemByName: (name) => ({ name }),
  },
};
const firstApplyRow = {
  status: "OK",
  anchorX: 100,
  anchorY: 200,
  pageRef: mockPage,
  itemRoot: "203281",
  itemNumber: "203281",
  metricRecord: metrics.recordsByRoot["203281"],
};
const secondApplyRow = {
  status: "OK",
  anchorX: 100,
  anchorY: 240,
  pageRef: mockPage,
  itemRoot: "10219",
  itemNumber: "10219",
  metricRecord: metrics.recordsByRoot["10219"],
};
const applyResult = applyItemMetricBoxesToRows(mockDoc, [firstApplyRow, secondApplyRow], 1);
assert.strictEqual(applyResult.appliedRows, 1);
assert.strictEqual(applyResult.createdBoxes, 1);
assert.strictEqual(firstApplyRow.applyStatus, "CREATED");
assert.strictEqual(secondApplyRow.applyStatus, "SKIPPED_LIMIT");
assert.deepStrictEqual(createdFrames.map((frame) => frame.contents), ["$124 / 11\r8\r3.42"]);
assert.strictEqual(createdFrames[0].fillColor.name, "Metric Background White");
assert.deepStrictEqual(createdFrames.map((frame) => frame.texts[0].pointSize), [14]);
assert.deepStrictEqual(createdFrames.map((frame) => frame.texts[0].leading), [10]);
assert.deepStrictEqual(createdFrames.map((frame) => frame.texts[0].fontStyle), ["Bold"]);
assert.deepStrictEqual(createdFrames[0].paragraphs.map((paragraph) => paragraph.pointSize), [14, 14, 14]);
assert.deepStrictEqual(createdFrames[0].paragraphs.map((paragraph) => paragraph.leading), [10, 10, 10]);
assert.deepStrictEqual(createdFrames[0].paragraphs.map((paragraph) => paragraph.fontStyle), ["Bold", "Bold", "Bold"]);
assert.deepStrictEqual(createdFrames[0].paragraphs.map((paragraph) => paragraph.fillColor.name), ["Metric Sales Blue", "Metric On Hand Green", "Metric Weight Red"]);
assert.strictEqual(createdFrames[0].strokeWeight, 0);
assert.strictEqual(createdFrames[0].strokeColor.name, "None");

const duplicateMetrics = parseItemMetricCsv([
  "ItemRoot,Last365DaysSales,UnitsLast365,CountOnHand,ItemAvgWeight",
  "203281,124,11,8,3.42",
  "203281,125,11,8,3.42",
].join("\n"));
assert.strictEqual(duplicateMetrics.errors.length, 1);
assert.strictEqual(duplicateMetrics.errors[0].indexOf("Duplicate ItemRoot with conflicting values") !== -1, true);

console.log("item metric box tests passed");
