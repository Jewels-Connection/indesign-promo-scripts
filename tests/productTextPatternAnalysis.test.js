const assert = require("assert");
const fs = require("fs");
const path = require("path");
require.extensions[".jsx"] = require.extensions[".js"];

const {
  analyzeProductText,
  collectPatternRowsFromDocument,
  groupPatternRows,
} = require("../Analyze Product Text Patterns.jsx");

const analyzerSource = fs.readFileSync(
  path.join(__dirname, "..", "Analyze Product Text Patterns.jsx"),
  "utf8"
);
assert(
  analyzerSource.indexOf("\\u201D") !== -1,
  "size detection should use unicode escapes for ExtendScript compatibility"
);

const simple = analyzeProductText("$9.99\r$14.99\rFREE MUG\r#12345");
assert.deepStrictEqual(simple.itemNumbers, ["#12345"]);
assert.deepStrictEqual(simple.prices, ["$9.99", "$14.99"]);
assert.strictEqual(simple.giftCandidate, "FREE MUG");
assert.strictEqual(
  simple.normalizedPattern,
  "<PRICE_1><LINE_BREAK><PRICE_2><LINE_BREAK><GIFT_TEXT><LINE_BREAK><ITEM_NUMBER>"
);

const labeled = analyzeProductText("SALE $12.99 REG $19.99 #AB-123/7");
assert.deepStrictEqual(labeled.itemNumbers, ["#AB-123/7"]);
assert.deepStrictEqual(labeled.prices, ["$12.99", "$19.99"]);
assert.strictEqual(labeled.giftCandidate, "");
assert.strictEqual(
  labeled.normalizedPattern,
  "SALE <PRICE_1> REG <PRICE_2> <ITEM_NUMBER>"
);

const spacedNumber = analyzeProductText("# 98765\t$8.00\r$10.00");
assert.deepStrictEqual(spacedNumber.itemNumbers, ["#98765"]);
assert.strictEqual(
  spacedNumber.normalizedPattern,
  "<ITEM_NUMBER><TAB><PRICE_1><LINE_BREAK><PRICE_2>"
);

const sized = analyzeProductText("6” $099    Reg $65999    #12618");
assert.deepStrictEqual(sized.prices, ["$099", "$65999"]);
assert.deepStrictEqual(sized.sizes, ["6"]);
assert.strictEqual(
  sized.normalizedPattern,
  "<SIZE_1> <PRICE_1> Reg <PRICE_2> <ITEM_NUMBER>"
);

const commaPrice = analyzeProductText("Reg $1,11999\rREGALO\r#29638");
assert.deepStrictEqual(commaPrice.prices, ["$1,11999"]);
assert.strictEqual(
  commaPrice.normalizedPattern,
  "Reg <PRICE_1><LINE_BREAK><GIFT_TEXT><LINE_BREAK><ITEM_NUMBER>"
);

const inlineGift = analyzeProductText(
  "7” $099    Reg $1,24999    8” $099    Reg $1,49999    REGALO    #12642"
);
assert.deepStrictEqual(inlineGift.prices, ["$099", "$1,24999", "$099", "$1,49999"]);
assert.deepStrictEqual(inlineGift.sizes, ["7", "8"]);
assert.strictEqual(inlineGift.giftCandidate, "REGALO");
assert.strictEqual(
  inlineGift.normalizedPattern,
  "<SIZE_1> <PRICE_1> Reg <PRICE_2> <SIZE_2> <PRICE_3> Reg <PRICE_4> <GIFT_TEXT> <ITEM_NUMBER>"
);

const adjustableNote = analyzeProductText("$099\rReg $31999\r#202184\r*Ajustables 17” - 18”");
assert.deepStrictEqual(adjustableNote.prices, ["$099", "$31999"]);
assert.deepStrictEqual(adjustableNote.sizes, ["17", "18"]);
assert.strictEqual(adjustableNote.giftCandidate, "");
assert.strictEqual(
  adjustableNote.normalizedPattern,
  "<PRICE_1><LINE_BREAK>Reg <PRICE_2><LINE_BREAK><ITEM_NUMBER><LINE_BREAK>*Ajustables <SIZE_1> - <SIZE_2>"
);

const rows = [
  { normalizedPattern: simple.normalizedPattern, itemNumbers: ["#12345"], rawText: "a" },
  { normalizedPattern: simple.normalizedPattern, itemNumbers: ["#67890"], rawText: "b" },
  { normalizedPattern: labeled.normalizedPattern, itemNumbers: ["#AB-123/7"], rawText: "c" },
];
const grouped = groupPatternRows(rows);
assert.strictEqual(grouped.length, 2);
assert.strictEqual(grouped[0].count, 2);
assert.strictEqual(grouped[0].patternId, "P001");
assert.strictEqual(grouped[1].count, 1);
assert.strictEqual(grouped[1].patternId, "P002");

const fakeDoc = {
  stories: [
    {
      contents: "$7.99\r$11.99\rREGALO A\r#44556",
      textContainers: [
        {
          name: "Product Box 1",
          parentPage: { name: "3" },
          itemLayer: { name: "Products" },
        },
      ],
    },
  ],
  textFrames: [],
};
const docRows = collectPatternRowsFromDocument(fakeDoc);
assert.strictEqual(docRows.length, 1);
assert.strictEqual(docRows[0].itemNumbers[0], "#44556");
assert.strictEqual(docRows[0].page, "3");
assert.strictEqual(docRows[0].textFrame, "Product Box 1");

console.log("product text pattern analysis tests passed");
