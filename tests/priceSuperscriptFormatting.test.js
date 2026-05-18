const assert = require("assert");
require.extensions[".jsx"] = require.extensions[".js"];

const {
  buildPriceSuperscriptRowsForText,
  findPriceSuperscriptRangesForText,
  getPriceSuperscriptStatus,
  priceSuperscriptPositionName,
  summarizePriceSuperscriptRanges,
} = require("../Format Product Price Superscripts.jsx");

let ranges = findPriceSuperscriptRangesForText("6\u201D $47039    Reg $48999    #12639");
assert.deepStrictEqual(
  ranges.map((range) => ({
    priceText: range.priceText,
    normalText: range.normalText,
    superscriptText: range.superscriptText,
  })),
  [
    { priceText: "$47039", normalText: "$470", superscriptText: "39" },
    { priceText: "$48999", normalText: "$489", superscriptText: "99" },
  ]
);

ranges = findPriceSuperscriptRangesForText("$1,11996\nREGALO B\n#203281");
assert.strictEqual(ranges.length, 1);
assert.strictEqual(ranges[0].normalText, "$1,119");
assert.strictEqual(ranges[0].superscriptText, "96");

ranges = findPriceSuperscriptRangesForText("Price $0.99 and old $099");
assert.deepStrictEqual(
  ranges.map((range) => [range.normalText, range.superscriptText]),
  [
    ["$0.", "99"],
    ["$0", "99"],
  ]
);

ranges = findPriceSuperscriptRangesForText("#10219 sizes 6-8\u201D and 9-10\u201D");
assert.strictEqual(ranges.length, 0);

ranges = findPriceSuperscriptRangesForText("US$ 12 and $8 and $91179");
assert.deepStrictEqual(
  ranges.map((range) => range.priceText),
  ["$ 12", "$91179"]
);

assert.strictEqual(
  summarizePriceSuperscriptRanges(findPriceSuperscriptRangesForText("$91179 $64019")),
  "$91179 | $64019"
);

assert.strictEqual(getPriceSuperscriptStatus(["NORMAL", "NORMAL"], ["SUPERSCRIPT"]), "OK");
assert.strictEqual(getPriceSuperscriptStatus(["SUPERSCRIPT"], ["SUPERSCRIPT"]), "NEEDS_FORMATTING");
assert.strictEqual(getPriceSuperscriptStatus(["NORMAL"], ["NORMAL"]), "NEEDS_FORMATTING");
assert.strictEqual(priceSuperscriptPositionName("Position.SUPERSCRIPT"), "SUPERSCRIPT");

let rows = buildPriceSuperscriptRowsForText("$91179 Reg $93999", {
  page: "1",
  textFrame: "Price Box",
  layer: "Jewelry",
}, (start, end, part) => {
  if (part === "normal") {
    return ["NORMAL"];
  }

  return ["SUPERSCRIPT"];
});
assert.deepStrictEqual(rows.map((row) => row.status), ["OK", "OK"]);
assert.strictEqual(rows[0].priceText, "$91179");
assert.strictEqual(rows[0].normalPositions, "NORMAL");
assert.strictEqual(rows[0].superscriptPositions, "SUPERSCRIPT");

rows = buildPriceSuperscriptRowsForText("$91179", {
  page: "2",
  textFrame: "Broken Price",
  layer: "Jewelry",
}, (start, end, part) => {
  if (part === "normal") {
    return ["SUPERSCRIPT"];
  }

  return ["NORMAL"];
});
assert.strictEqual(rows[0].status, "NEEDS_FORMATTING");

console.log("price superscript formatting tests passed");
