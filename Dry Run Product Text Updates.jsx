/*
Dry Run Product Text Updates.jsx

Reads product_data.csv, scans the active InDesign document, and writes a
non-destructive CSV report showing which prices and REGALO text would be used.
It does not modify the document.
*/

function normalizeLineEndings(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimText(value) {
    return String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "");
}

function padNumber(value, width) {
    var output = String(value);

    while (output.length < width) {
        output = "0" + output;
    }

    return output;
}

function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var source = String(text || "");
    var i;

    for (i = 0; i < source.length; i++) {
        var character = source.charAt(i);
        var nextCharacter = i + 1 < source.length ? source.charAt(i + 1) : "";

        if (inQuotes) {
            if (character === "\"" && nextCharacter === "\"") {
                field += "\"";
                i++;
            } else if (character === "\"") {
                inQuotes = false;
            } else {
                field += character;
            }
        } else if (character === "\"") {
            inQuotes = true;
        } else if (character === ",") {
            row.push(field);
            field = "";
        } else if (character === "\r" || character === "\n") {
            if (character === "\r" && nextCharacter === "\n") {
                i++;
            }

            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += character;
        }
    }

    row.push(field);
    rows.push(row);

    return rows;
}

function normalizeHeader(header) {
    return trimText(header).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getColumnIndex(headers, aliases) {
    var normalizedAliases = {};
    var i;

    for (i = 0; i < aliases.length; i++) {
        normalizedAliases[normalizeHeader(aliases[i])] = true;
    }

    for (i = 0; i < headers.length; i++) {
        if (normalizedAliases[normalizeHeader(headers[i])]) {
            return i;
        }
    }

    return -1;
}

function normalizeItemCode(value) {
    return trimText(value).replace(/^#/, "").toUpperCase();
}

function normalizeGiftCode(value) {
    var code = trimText(value).toUpperCase();

    if (code === "" || code === "0" || code === "NONE" || code === "N/A" || code === "NA" || code === "NO") {
        return "";
    }

    if (/^[A-D]$/.test(code)) {
        return code;
    }

    return code;
}

function formatDocumentPrice(value) {
    var price = trimText(value).replace(/\s+/g, "");

    if (price === "") {
        return "";
    }

    if (price.charAt(0) !== "$") {
        price = "$" + price;
    }

    price = price.replace(/\.([0-9][0-9])$/, "$1");

    return price;
}

function parseProductDataCsv(csvText) {
    var parsedRows = parseCsv(csvText);
    var result = {
        validRows: [],
        blankRows: [],
        errors: [],
        duplicates: [],
        recordsByCode: {}
    };

    if (parsedRows.length === 0) {
        result.errors.push("CSV is empty");
        return result;
    }

    var headers = parsedRows[0];
    var itemCodeIndex = getColumnIndex(headers, ["ItemCode", "Item Code"]);
    var discountIndex = getColumnIndex(headers, ["DiscountPrice", "Discount Price"]);
    var originalIndex = getColumnIndex(headers, ["OriginalPrice", "Original Price", "RegPrice", "Regular Price"]);
    var giftIndex = getColumnIndex(headers, ["GiftCode", "Gift Code", "Gift"]);
    var seen = {};
    var rowIndex;

    if (itemCodeIndex === -1 || discountIndex === -1 || originalIndex === -1 || giftIndex === -1) {
        result.errors.push("CSV must include ItemCode, DiscountPrice, OriginalPrice, and GiftCode columns");
        return result;
    }

    for (rowIndex = 1; rowIndex < parsedRows.length; rowIndex++) {
        var row = parsedRows[rowIndex];
        var itemCode = normalizeItemCode(row[itemCodeIndex]);
        var discountPrice = trimText(row[discountIndex]);
        var originalPrice = trimText(row[originalIndex]);
        var giftCode = normalizeGiftCode(row[giftIndex]);

        if (itemCode === "" && discountPrice === "" && originalPrice === "" && trimText(row[giftIndex]) === "") {
            result.blankRows.push(rowIndex + 1);
            continue;
        }

        if (itemCode === "" || discountPrice === "") {
            result.errors.push("Row " + (rowIndex + 1) + " is missing ItemCode or DiscountPrice");
            continue;
        }

        var record = {
            sourceRow: rowIndex + 1,
            itemCode: itemCode,
            discountPrice: discountPrice,
            originalPrice: originalPrice,
            giftCode: giftCode,
            discountDocumentPrice: formatDocumentPrice(discountPrice),
            originalDocumentPrice: formatDocumentPrice(originalPrice)
        };

        result.validRows.push(record);

        if (seen[itemCode]) {
            result.duplicates.push(itemCode);

            if (recordsEquivalent(result.recordsByCode[itemCode], record)) {
                continue;
            }

            result.errors.push("Duplicate ItemCode with conflicting values: " + itemCode);
            continue;
        }

        seen[itemCode] = true;
        result.recordsByCode[itemCode] = record;
    }

    return result;
}

function recordsEquivalent(a, b) {
    return a &&
        b &&
        a.discountDocumentPrice === b.discountDocumentPrice &&
        a.originalDocumentPrice === b.originalDocumentPrice &&
        a.giftCode === b.giftCode;
}

function rangesOverlap(a, b) {
    return a.start < b.end && b.start < a.end;
}

function addToken(tokens, token) {
    var i;

    for (i = 0; i < tokens.length; i++) {
        if (rangesOverlap(tokens[i], token)) {
            return false;
        }
    }

    tokens.push(token);
    return true;
}

function findItemNumberTokens(text) {
    var tokens = [];
    var pattern = /(^|[^\w])#\s*([A-Za-z0-9][A-Za-z0-9._\/-]*)/g;
    var match;

    while ((match = pattern.exec(text)) !== null) {
        var prefixLength = match[1].length;
        var start = match.index + prefixLength;
        var raw = match[0].substr(prefixLength);

        tokens.push({
            type: "ITEM_NUMBER",
            value: "#" + match[2],
            start: start,
            end: start + raw.length,
            raw: raw
        });
    }

    return tokens;
}

function findPriceTokens(text, existingTokens) {
    var tokens = [];
    var pattern = /(US\$|\$)[ \t]*[0-9][0-9,]*(\.[0-9][0-9])?/g;
    var match;

    while ((match = pattern.exec(text)) !== null) {
        var token = {
            type: "PRICE",
            value: match[0].replace(/\s+/g, ""),
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0]
        };

        if (addToken(existingTokens.concat(tokens), token)) {
            tokens.push(token);
        }
    }

    return tokens;
}

function findSizeTokens(text, existingTokens) {
    var tokens = [];
    var pattern = /\b([0-9]+(?:\.[0-9]+)?(?:-[0-9]+(?:\.[0-9]+)?)?)[ \t]*(?:["\u201D\u201C\u2033]|in\b)/g;
    var match;

    while ((match = pattern.exec(text)) !== null) {
        var token = {
            type: "SIZE",
            value: match[1],
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0]
        };

        if (addToken(existingTokens.concat(tokens), token)) {
            tokens.push(token);
        }
    }

    return tokens;
}

function sortTokens(tokens) {
    tokens.sort(function (a, b) {
        if (a.start !== b.start) {
            return a.start - b.start;
        }

        return b.end - a.end;
    });
}

function extractGiftKeywordText(text) {
    var matches = [];
    var pattern = /\b(REGALO(?:\s+[A-D])?|GIFT|FREE|BONUS|GRATIS|INCLUIDO)\b/ig;
    var match;

    while ((match = pattern.exec(text)) !== null) {
        matches.push(match[0].replace(/\s+/g, " "));
    }

    return matches.join(" ");
}

function analyzeProductText(text) {
    var source = normalizeLineEndings(text);
    var itemTokens = findItemNumberTokens(source);
    var priceTokens = findPriceTokens(source, itemTokens);
    var sizeTokens = findSizeTokens(source, itemTokens.concat(priceTokens));
    var tokens = itemTokens.concat(priceTokens).concat(sizeTokens);
    var itemNumbers = [];
    var prices = [];
    var sizes = [];
    var priceGroupSizes = [];
    var firstItemNumberStart = itemTokens.length > 0 ? itemTokens[0].start : source.length + 1;
    var i;

    sortTokens(tokens);

    for (i = 0; i < tokens.length; i++) {
        if (tokens[i].type === "ITEM_NUMBER") {
            itemNumbers.push(tokens[i].value);
        } else if (tokens[i].type === "PRICE") {
            prices.push(tokens[i].value);
        } else if (tokens[i].type === "SIZE") {
            sizes.push(tokens[i].value);

            if (tokens[i].start < firstItemNumberStart) {
                priceGroupSizes.push(tokens[i].value);
            }
        }
    }

    return {
        rawText: source,
        itemNumbers: itemNumbers,
        prices: prices,
        sizes: sizes,
        priceGroupSizes: priceGroupSizes,
        giftCandidate: extractGiftKeywordText(source),
        tokens: tokens
    };
}

function expandSizeLabel(sizeLabel) {
    var normalized = trimText(sizeLabel);
    var parts = normalized.split("-");
    var output = [];
    var start;
    var end;
    var value;

    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        start = parseInt(parts[0], 10);
        end = parseInt(parts[1], 10);

        if (end >= start && end - start <= 20) {
            for (value = start; value <= end; value++) {
                output.push(String(value));
            }

            return output;
        }
    }

    return [normalized];
}

function normalizeItemNumber(itemNumber) {
    return normalizeItemCode(itemNumber);
}

function getUniqueValues(values) {
    var seen = {};
    var output = [];
    var i;

    for (i = 0; i < values.length; i++) {
        if (!seen[values[i]]) {
            seen[values[i]] = true;
            output.push(values[i]);
        }
    }

    return output;
}

function joinArray(values, separator) {
    var parts = [];
    var i;

    for (i = 0; i < values.length; i++) {
        parts.push(values[i]);
    }

    return parts.join(separator);
}

function resolveDisplaySizeGroup(itemNumber, sizeLabel, productData) {
    var expandedSizes = sizeLabel ? expandSizeLabel(sizeLabel) : [""];
    var records = [];
    var missingCodes = [];
    var ambiguousCodes = [];
    var fallbackNotes = [];
    var itemCodes = [];
    var i;

    if (!sizeLabel) {
        var baseRecord = productData.recordsByCode[itemNumber];

        if (baseRecord) {
            return {
                displaySize: "",
                expandedSizes: [""],
                itemCodes: [itemNumber],
                records: [baseRecord],
                missingCodes: [],
                ambiguousCodes: [],
                fallbackNotes: []
            };
        }

        var prefixedRecords = findRecordsForItemPrefix(itemNumber, productData);

        if (prefixedRecords.length === 1) {
            return {
                displaySize: "",
                expandedSizes: [getItemCodeSuffix(itemNumber, prefixedRecords[0].itemCode)],
                itemCodes: [prefixedRecords[0].itemCode],
                records: [prefixedRecords[0]],
                missingCodes: [],
                ambiguousCodes: [],
                fallbackNotes: ["Base item missing; used only matching product-data size " + prefixedRecords[0].itemCode]
            };
        }

        if (prefixedRecords.length > 1) {
            if (allRecordsEquivalent(prefixedRecords)) {
                for (i = 0; i < prefixedRecords.length; i++) {
                    itemCodes.push(prefixedRecords[i].itemCode);
                }

                return {
                    displaySize: "",
                    expandedSizes: [""],
                    itemCodes: itemCodes,
                    records: [prefixedRecords[0]],
                    missingCodes: [],
                    ambiguousCodes: [],
                    fallbackNotes: ["Base item missing; collapsed " + prefixedRecords.length + " equivalent product-data variants"]
                };
            }

            for (i = 0; i < prefixedRecords.length; i++) {
                ambiguousCodes.push(prefixedRecords[i].itemCode);
            }

            return {
                displaySize: "",
                expandedSizes: [""],
                itemCodes: ambiguousCodes,
                records: [],
                missingCodes: [],
                ambiguousCodes: ambiguousCodes,
                fallbackNotes: []
            };
        }

        return {
            displaySize: "",
            expandedSizes: [""],
            itemCodes: [itemNumber],
            records: [],
            missingCodes: [itemNumber],
            ambiguousCodes: [],
            fallbackNotes: []
        };
    }

    for (i = 0; i < expandedSizes.length; i++) {
        var itemCode = itemNumber + "-" + expandedSizes[i];
        var record = productData.recordsByCode[itemCode];

        if (!record) {
            var decimalSize = getDecimalSizeFallback(expandedSizes[i]);
            var decimalItemCode = decimalSize ? itemNumber + "-" + decimalSize : "";

            if (decimalItemCode && productData.recordsByCode[decimalItemCode]) {
                itemCode = decimalItemCode;
                record = productData.recordsByCode[decimalItemCode];
                fallbackNotes.push("Used decimal size fallback " + expandedSizes[i] + " -> " + decimalSize);
            }
        }

        if (record) {
            itemCodes.push(itemCode);
            records.push(record);
        } else {
            itemCodes.push(itemCode);
            missingCodes.push(itemCode);
        }
    }

    return {
        displaySize: sizeLabel || "",
        expandedSizes: expandedSizes,
        itemCodes: itemCodes,
        records: records,
        missingCodes: missingCodes,
        ambiguousCodes: ambiguousCodes,
        fallbackNotes: fallbackNotes
    };
}

function findRecordsForItemPrefix(itemNumber, productData) {
    var prefix = itemNumber + "-";
    var records = [];
    var i;

    for (i = 0; i < productData.validRows.length; i++) {
        if (productData.validRows[i].itemCode.indexOf(prefix) === 0) {
            records.push(productData.validRows[i]);
        }
    }

    return records;
}

function allRecordsEquivalent(records) {
    var first;
    var i;

    if (records.length === 0) {
        return false;
    }

    first = records[0];

    for (i = 1; i < records.length; i++) {
        if (!recordsEquivalent(first, records[i])) {
            return false;
        }
    }

    return true;
}

function getItemCodeSuffix(itemNumber, itemCode) {
    var prefix = itemNumber + "-";

    if (itemCode.indexOf(prefix) === 0) {
        return itemCode.substr(prefix.length);
    }

    return "";
}

function getDecimalSizeFallback(sizeLabel) {
    var value = trimText(sizeLabel);

    if (/^[0-9][0-9]$/.test(value)) {
        return value.charAt(0) + "." + value.charAt(1);
    }

    return "";
}

function summarizeResolvedGroup(group) {
    var discountValues = [];
    var originalValues = [];
    var giftValues = [];
    var i;

    for (i = 0; i < group.records.length; i++) {
        discountValues.push(group.records[i].discountDocumentPrice);
        originalValues.push(group.records[i].originalDocumentPrice);
        giftValues.push(group.records[i].giftCode);
    }

    return {
        discounts: getUniqueValues(discountValues),
        originals: getUniqueValues(originalValues),
        gifts: getUniqueValues(giftValues)
    };
}

function statusForGroup(group, summary) {
    if (group.missingCodes.length > 0) {
        return "MISSING_PRODUCT_DATA";
    }

    if (group.ambiguousCodes.length > 0) {
        return "AMBIGUOUS_PRODUCT_SIZE";
    }

    if (summary.discounts.length > 1 || summary.originals.length > 1 || summary.gifts.length > 1) {
        return "RANGE_VALUES_DIFFER";
    }

    return "OK";
}

function buildDryRunRowsForText(rawText, productData, context) {
    var analysis = analyzeProductText(rawText);
    var rows = [];
    var itemNumber = analysis.itemNumbers.length > 0 ? normalizeItemNumber(analysis.itemNumbers[0]) : "";
    var displaySizes = analysis.priceGroupSizes.length > 0 ? analysis.priceGroupSizes : [""];
    var sizeIndex;

    if (itemNumber === "") {
        rows.push(makeDryRunRow(context, analysis, "", "", [], "NO_ITEM_NUMBER", "No item number found"));
        return rows;
    }

    if (analysis.itemNumbers.length > 1) {
        rows.push(makeDryRunRow(context, analysis, itemNumber, "", [], "MULTIPLE_ITEM_NUMBERS", "Expected one item number but found " + analysis.itemNumbers.length));
        return rows;
    }

    for (sizeIndex = 0; sizeIndex < displaySizes.length; sizeIndex++) {
        var group = resolveDisplaySizeGroup(itemNumber, displaySizes[sizeIndex], productData);
        var summary = summarizeResolvedGroup(group);
        var status = statusForGroup(group, summary);
        var note = "";
        var giftCode = summary.gifts.length === 1 ? summary.gifts[0] : "";
        var desiredGiftText = giftCode ? "REGALO " + giftCode : "";
        var desiredMode = giftCode ? "GIFT_REMOVE_REGULAR_PRICE" : "NO_GIFT_KEEP_REGULAR_PRICE";

        if (status === "MISSING_PRODUCT_DATA") {
            note = "Missing: " + joinArray(group.missingCodes, " | ");
        } else if (status === "AMBIGUOUS_PRODUCT_SIZE") {
            note = "Base item missing and multiple product-data sizes exist: " + joinArray(group.ambiguousCodes, " | ");
        } else if (status === "RANGE_VALUES_DIFFER") {
            note = "Expanded size range has differing discount/original/gift values";
        }

        if (group.fallbackNotes.length > 0) {
            note = note ? note + "; " + joinArray(group.fallbackNotes, "; ") : joinArray(group.fallbackNotes, "; ");
        }

        rows.push({
            status: status,
            page: context.page || "",
            textFrame: context.textFrame || "",
            layer: context.layer || "",
            itemNumber: itemNumber,
            displaySize: group.displaySize,
            expandedSizes: joinArray(group.expandedSizes, " | "),
            itemCodes: joinArray(group.itemCodes, " | "),
            currentPrices: joinArray(analysis.prices, " | "),
            currentGiftText: analysis.giftCandidate,
            desiredMode: desiredMode,
            desiredDiscountPrice: summary.discounts.length === 1 ? summary.discounts[0] : "",
            desiredOriginalPrice: summary.originals.length === 1 ? summary.originals[0] : "",
            desiredGiftText: desiredGiftText,
            notes: note,
            rawText: analysis.rawText
        });
    }

    return rows;
}

function makeDryRunRow(context, analysis, itemNumber, displaySize, itemCodes, status, notes) {
    return {
        status: status,
        page: context.page || "",
        textFrame: context.textFrame || "",
        layer: context.layer || "",
        itemNumber: itemNumber,
        displaySize: displaySize,
        expandedSizes: displaySize,
        itemCodes: joinArray(itemCodes, " | "),
        currentPrices: joinArray(analysis.prices, " | "),
        currentGiftText: analysis.giftCandidate,
        desiredMode: "",
        desiredDiscountPrice: "",
        desiredOriginalPrice: "",
        desiredGiftText: "",
        notes: notes,
        rawText: analysis.rawText
    };
}

function getStoryFirstTextContainer(story) {
    try {
        if (story.textContainers && story.textContainers.length > 0) {
            return story.textContainers[0];
        }
    } catch (error) {
        return null;
    }

    return null;
}

function getStoryPageName(story) {
    var container = getStoryFirstTextContainer(story);

    try {
        if (container && container.parentPage) {
            return container.parentPage.name;
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getStoryTextFrameName(story) {
    var container = getStoryFirstTextContainer(story);

    try {
        if (container) {
            return container.name || "";
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getStoryLayerName(story) {
    var container = getStoryFirstTextContainer(story);

    try {
        if (container && container.itemLayer) {
            return container.itemLayer.name;
        }
    } catch (error) {
        return "";
    }

    return "";
}

function collectDryRunRowsFromDocument(doc, productData) {
    var rows = [];
    var storyIndex;

    for (storyIndex = 0; storyIndex < doc.stories.length; storyIndex++) {
        var story = doc.stories[storyIndex];
        var analysis = analyzeProductText(story.contents);

        if (analysis.itemNumbers.length === 0) {
            continue;
        }

        rows = rows.concat(buildDryRunRowsForText(story.contents, productData, {
            page: getStoryPageName(story),
            textFrame: getStoryTextFrameName(story),
            layer: getStoryLayerName(story)
        }));
    }

    return rows;
}

function escapeCsv(value) {
    var source = String(value === undefined || value === null ? "" : value);
    return "\"" + source.replace(/"/g, "\"\"") + "\"";
}

function csvLine(values) {
    var escaped = [];
    var i;

    for (i = 0; i < values.length; i++) {
        escaped.push(escapeCsv(values[i]));
    }

    return escaped.join(",");
}

function writeDryRunReport(rows, reportFile) {
    var lines = [
        csvLine([
            "Status",
            "Page",
            "Text Frame",
            "Layer",
            "Item Number",
            "Display Size",
            "Expanded Sizes",
            "Item Codes",
            "Current Prices",
            "Current Gift Text",
            "Desired Mode",
            "Desired Discount Price",
            "Desired Original Price",
            "Desired Gift Text",
            "Notes",
            "Raw Text"
        ])
    ];
    var i;

    for (i = 0; i < rows.length; i++) {
        lines.push(csvLine([
            rows[i].status,
            rows[i].page,
            rows[i].textFrame,
            rows[i].layer,
            rows[i].itemNumber,
            rows[i].displaySize,
            rows[i].expandedSizes,
            rows[i].itemCodes,
            rows[i].currentPrices,
            rows[i].currentGiftText,
            rows[i].desiredMode,
            rows[i].desiredDiscountPrice,
            rows[i].desiredOriginalPrice,
            rows[i].desiredGiftText,
            rows[i].notes,
            rows[i].rawText
        ]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function writeProductDataIssueReport(productData, reportFile) {
    var lines = [
        csvLine(["Issue Type", "Value", "Notes"])
    ];
    var i;

    for (i = 0; i < productData.errors.length; i++) {
        lines.push(csvLine(["ERROR", "", productData.errors[i]]));
    }

    for (i = 0; i < productData.duplicates.length; i++) {
        lines.push(csvLine(["DUPLICATE_ITEM_CODE", productData.duplicates[i], "Duplicate rows with identical values are ignored; conflicting values are reported as errors."]));
    }

    for (i = 0; i < productData.blankRows.length; i++) {
        lines.push(csvLine(["BLANK_ROW", productData.blankRows[i], "Ignored blank product data row"]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function makeTimestamp(date) {
    return [
        date.getFullYear(),
        padNumber(date.getMonth() + 1, 2),
        padNumber(date.getDate(), 2)
    ].join("-") + "_" + [
        padNumber(date.getHours(), 2),
        padNumber(date.getMinutes(), 2),
        padNumber(date.getSeconds(), 2)
    ].join("-");
}

function getReportFolder(doc) {
    try {
        if (doc.saved && doc.filePath) {
            return doc.filePath;
        }
    } catch (error) {
        // Fall through to desktop.
    }

    return Folder.desktop;
}

function getScriptFolder() {
    try {
        return File($.fileName).parent;
    } catch (error) {
        return Folder.current;
    }
}

function readTextFile(file) {
    file.encoding = "UTF-8";
    file.open("r");
    var text = file.read();
    file.close();
    return text;
}

function countRowsByStatus(rows, status) {
    var count = 0;
    var i;

    for (i = 0; i < rows.length; i++) {
        if (rows[i].status === status) {
            count++;
        }
    }

    return count;
}

function main() {
    if (app.documents.length === 0) {
        alert("Open an InDesign document before running this script.");
        return;
    }

    var scriptFolder = getScriptFolder();
    var dataFile = File(scriptFolder + "/product_data.csv");

    if (!dataFile.exists) {
        alert("Could not find product_data.csv next to this script:\r" + dataFile.fsName);
        return;
    }

    var productData = parseProductDataCsv(readTextFile(dataFile));

    if (productData.errors.length > 0) {
        alert("Product data has " + productData.errors.length + " error(s). A dry-run report will still be written, but review product data issues first.");
    }

    var doc = app.activeDocument;
    var rows = collectDryRunRowsFromDocument(doc, productData);
    var reportFolder = getReportFolder(doc);
    var timestamp = makeTimestamp(new Date());
    var dryRunFile = File(reportFolder + "/Product Text Update Dry Run " + timestamp + ".csv");
    var issuesFile = File(reportFolder + "/Product Data Issues " + timestamp + ".csv");

    writeDryRunReport(rows, dryRunFile);
    writeProductDataIssueReport(productData, issuesFile);

    alert(
        "Dry run complete.\r\r" +
        "Rows: " + rows.length + "\r" +
        "OK: " + countRowsByStatus(rows, "OK") + "\r" +
        "Missing product data: " + countRowsByStatus(rows, "MISSING_PRODUCT_DATA") + "\r" +
        "Range value conflicts: " + countRowsByStatus(rows, "RANGE_VALUES_DIFFER") + "\r\r" +
        "Dry run:\r" + dryRunFile.fsName + "\r\r" +
        "Product data issues:\r" + issuesFile.fsName
    );
}

if (typeof app !== "undefined" && typeof PRODUCT_TEXT_UPDATE_SKIP_MAIN === "undefined") {
    main();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        analyzeProductText: analyzeProductText,
        buildDryRunRowsForText: buildDryRunRowsForText,
        countRowsByStatus: countRowsByStatus,
        csvLine: csvLine,
        escapeCsv: escapeCsv,
        formatDocumentPrice: formatDocumentPrice,
        getReportFolder: getReportFolder,
        getScriptFolder: getScriptFolder,
        getStoryLayerName: getStoryLayerName,
        getStoryPageName: getStoryPageName,
        getStoryTextFrameName: getStoryTextFrameName,
        makeTimestamp: makeTimestamp,
        normalizeGiftCode: normalizeGiftCode,
        parseCsv: parseCsv,
        parseProductDataCsv: parseProductDataCsv,
        readTextFile: readTextFile,
        writeProductDataIssueReport: writeProductDataIssueReport
    };
}
