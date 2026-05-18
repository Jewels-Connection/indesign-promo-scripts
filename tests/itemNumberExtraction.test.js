const assert = require("assert");
require.extensions[".jsx"] = require.extensions[".js"];

const {
  extractItemNumbersFromText,
} = require("../Find All Item Numbers.jsx");

function itemNumbers(text) {
  return extractItemNumbersFromText(text).map((match) => match.itemNumber);
}

assert.deepStrictEqual(
  itemNumbers("$9.99\n$14.99\nFree gift\n#12345"),
  ["#12345"]
);

assert.deepStrictEqual(
  itemNumbers("Discount Price: $8 Original Price: $12 Gift: Mug Item Number: #AB-123/7"),
  ["#AB-123/7"]
);

assert.deepStrictEqual(
  itemNumbers("# 98765 and #SKU_42"),
  ["#98765", "#SKU_42"]
);

assert.deepStrictEqual(
  itemNumbers("No item number in this text frame"),
  []
);

console.log("item number extraction tests passed");
