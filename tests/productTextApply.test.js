const assert = require("assert");
require.extensions[".jsx"] = require.extensions[".js"];

const { parseProductDataCsv } = require("../Dry Run Product Text Updates.jsx");
const {
  buildTextUpdatePlan,
  applyTextEditsToString,
} = require("../Apply Product Text Updates.jsx");

const productCsv = [
  "ItemCode,DiscountPrice,OriginalPrice,GiftCode",
  "12921,$389.95,$409.99,0",
  "204060,$649.96,$649.99,A",
  "203281-7,\"$1,119.96\",\"$1,119.99\",B",
  "203281-8,\"$1,249.96\",\"$1,249.99\",B",
  "10219-6,$939.96,$939.99,A",
  "10219-7,$939.96,$939.99,A",
  "10219-8,$939.96,$939.99,A",
  "10219-9,\"$1,039.96\",\"$1,039.99\",B",
  "10219-10,\"$1,039.96\",\"$1,039.99\",B",
  "203573-6,$869.96,$869.99,A",
  "203573-7,$869.96,$869.99,A",
  "203573-8,$899.96,$899.99,A",
].join("\n");

const productData = parseProductDataCsv(productCsv);

let plan = buildTextUpdatePlan("$099\nReg $38999\n#12921", productData, {
  page: "1",
  textFrame: "No Gift",
  layer: "Jewelry",
});
assert.strictEqual(plan.storyStatus, "UPDATED");
assert.strictEqual(plan.updatedText, "$38995\nReg $40999\n#12921");
assert.strictEqual(plan.applyRows[0].applyStatus, "UPDATED");

plan = buildTextUpdatePlan("$099\nReg $38999\nREGALO\n#204060", productData, {
  page: "2",
  textFrame: "Gift Existing",
  layer: "Jewelry",
});
assert.strictEqual(plan.storyStatus, "UPDATED");
assert.strictEqual(plan.updatedText, "$64996\nREGALO A\n#204060");

plan = buildTextUpdatePlan("$099\nReg $38999\n#204060", productData, {
  page: "3",
  textFrame: "Gift Missing",
  layer: "Jewelry",
});
assert.strictEqual(plan.storyStatus, "UPDATED");
assert.strictEqual(plan.updatedText, "$64996\nREGALO A\n#204060");

plan = buildTextUpdatePlan(
  "7\u201D $099    Reg $1,11999    8\u201D $099    Reg $1,24999    REGALO    #203281",
  productData,
  { page: "4", textFrame: "Sized Gift", layer: "Jewelry" }
);
assert.strictEqual(plan.storyStatus, "UPDATED");
assert.strictEqual(
  plan.updatedText,
  "7\u201D $1,11996    8\u201D $1,24996    REGALO B    #203281"
);

plan = buildTextUpdatePlan(
  "6-8\u201D $099\nReg $86999\n#203573",
  productData,
  { page: "5", textFrame: "Range Conflict", layer: "Jewelry" }
);
assert.strictEqual(plan.storyStatus, "SKIPPED_NON_OK_ROW");
assert.strictEqual(plan.updatedText, "6-8\u201D $099\nReg $86999\n#203573");
assert.strictEqual(plan.applyRows[0].applyStatus, "SKIPPED_RANGE_VALUES_DIFFER");

plan = buildTextUpdatePlan(
  "6-8\u201D $099    Reg $93999    9-10\u201D $099    Reg $1,03999    REGALO    #10219",
  productData,
  { page: "6", textFrame: "Mixed Gifts", layer: "Jewelry" }
);
assert.strictEqual(plan.storyStatus, "SKIPPED_MIXED_GIFT_TEXT");
assert.strictEqual(plan.edits.length, 0);

assert.strictEqual(
  applyTextEditsToString("abcdef", [
    { start: 1, end: 3, replacement: "XX" },
    { start: 5, end: 5, replacement: "!" },
  ]),
  "aXXde!f"
);

console.log("product text apply tests passed");
