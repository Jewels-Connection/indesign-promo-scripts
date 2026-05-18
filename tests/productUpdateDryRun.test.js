const assert = require("assert");
require.extensions[".jsx"] = require.extensions[".js"];

const {
  buildDryRunRowsForText,
  formatDocumentPrice,
  normalizeGiftCode,
  parseProductDataCsv,
} = require("../Dry Run Product Text Updates.jsx");

const productCsv = [
  "ItemCode,DiscountPrice,OriginalPrice,GiftCode",
  "12921,$389.95,$389.99,0",
  "202807-10,$389.95,$389.99,0",
  "203585-A,$289.94,$289.99,0",
  "203585-B,$289.94,$289.99,0",
  "203281-7,\"$1,119.96\",\"$1,119.99\",B",
  "203281-8,\"$1,249.96\",\"$1,249.99\",B",
  "205740-7.5,\"$1,499.96\",\"$1,499.99\",B",
  "10219-6,$939.96,$939.99,A",
  "10219-7,$939.96,$939.99,A",
  "10219-8,$939.96,$939.99,A",
  "10219-9,\"$1,039.96\",\"$1,039.99\",B",
  "10219-10,\"$1,039.96\",\"$1,039.99\",B",
].join("\n");

const productData = parseProductDataCsv(productCsv);

assert.strictEqual(formatDocumentPrice("$1,119.96"), "$1,11996");
assert.strictEqual(formatDocumentPrice("$0.99"), "$099");
assert.strictEqual(normalizeGiftCode("0"), "");
assert.strictEqual(normalizeGiftCode(" b "), "B");

assert.strictEqual(productData.validRows.length, 12);
assert.strictEqual(productData.recordsByCode["203281-7"].discountDocumentPrice, "$1,11996");

const simpleNoGiftRows = buildDryRunRowsForText(
  "$099\r\nReg $38999\r\n#12921",
  productData,
  { page: "1", textFrame: "Box A", layer: "Jewelry" }
);
assert.strictEqual(simpleNoGiftRows.length, 1);
assert.strictEqual(simpleNoGiftRows[0].status, "OK");
assert.strictEqual(simpleNoGiftRows[0].desiredMode, "NO_GIFT_KEEP_REGULAR_PRICE");
assert.strictEqual(simpleNoGiftRows[0].desiredDiscountPrice, "$38995");
assert.strictEqual(simpleNoGiftRows[0].desiredOriginalPrice, "$38999");
assert.strictEqual(simpleNoGiftRows[0].desiredGiftText, "");

const sizedGiftRows = buildDryRunRowsForText(
  "7\u201D $099    Reg $1,11999    8\u201D $099    Reg $1,24999    REGALO    #203281",
  productData,
  { page: "2", textFrame: "Box B", layer: "Jewelry" }
);
assert.strictEqual(sizedGiftRows.length, 2);
assert.deepStrictEqual(
  sizedGiftRows.map((row) => [row.displaySize, row.itemCodes, row.desiredDiscountPrice, row.desiredGiftText, row.status]),
  [
    ["7", "203281-7", "$1,11996", "REGALO B", "OK"],
    ["8", "203281-8", "$1,24996", "REGALO B", "OK"],
  ]
);

const rangeRows = buildDryRunRowsForText(
  "6-8\u201D $099\r\nReg $93999\r\n9-10\u201D $099\r\nReg $1,03999\r\nREGALO\r\n#10219",
  productData,
  { page: "3", textFrame: "Box C", layer: "Jewelry" }
);
assert.strictEqual(rangeRows.length, 2);
assert.strictEqual(rangeRows[0].status, "OK");
assert.strictEqual(rangeRows[0].displaySize, "6-8");
assert.strictEqual(rangeRows[0].itemCodes, "10219-6 | 10219-7 | 10219-8");
assert.strictEqual(rangeRows[0].desiredGiftText, "REGALO A");
assert.strictEqual(rangeRows[1].displaySize, "9-10");
assert.strictEqual(rangeRows[1].desiredGiftText, "REGALO B");

const missingRows = buildDryRunRowsForText(
  "$099\r\nReg $99999\r\n#99999",
  productData,
  { page: "4", textFrame: "Box D", layer: "Jewelry" }
);
assert.strictEqual(missingRows[0].status, "MISSING_PRODUCT_DATA");
assert.strictEqual(missingRows[0].itemCodes, "99999");

const adjustableRows = buildDryRunRowsForText(
  "$099\r\nReg $38999\r\n#12921\r\n*Ajustables 17\u201D - 18\u201D",
  productData,
  { page: "5", textFrame: "Box E", layer: "Jewelry" }
);
assert.strictEqual(adjustableRows.length, 1);
assert.strictEqual(adjustableRows[0].status, "OK");
assert.strictEqual(adjustableRows[0].displaySize, "");
assert.strictEqual(adjustableRows[0].itemCodes, "12921");

const onlyProductSizeRows = buildDryRunRowsForText(
  "$099    Reg $38999    #202807    Tobillera Ajustable 9\u201D-10\u201D",
  productData,
  { page: "6", textFrame: "Box F", layer: "Jewelry" }
);
assert.strictEqual(onlyProductSizeRows.length, 1);
assert.strictEqual(onlyProductSizeRows[0].status, "OK");
assert.strictEqual(onlyProductSizeRows[0].itemCodes, "202807-10");

const equivalentVariantRows = buildDryRunRowsForText(
  "$099\r\nReg $28999\r\n#203585",
  productData,
  { page: "6", textFrame: "Box Variant", layer: "Jewelry" }
);
assert.strictEqual(equivalentVariantRows.length, 1);
assert.strictEqual(equivalentVariantRows[0].status, "OK");
assert.strictEqual(equivalentVariantRows[0].itemCodes, "203585-A | 203585-B");
assert.strictEqual(equivalentVariantRows[0].desiredDiscountPrice, "$28994");

const decimalFallbackRows = buildDryRunRowsForText(
  "75\u201D $1,49996      Reg $1,49999      REGALO B      #205740",
  productData,
  { page: "7", textFrame: "Box G", layer: "Jewelry" }
);
assert.strictEqual(decimalFallbackRows.length, 1);
assert.strictEqual(decimalFallbackRows[0].status, "OK");
assert.strictEqual(decimalFallbackRows[0].displaySize, "75");
assert.strictEqual(decimalFallbackRows[0].itemCodes, "205740-7.5");

console.log("product update dry-run tests passed");
