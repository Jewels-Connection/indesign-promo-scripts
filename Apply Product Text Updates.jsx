/*
Apply Product Text Updates.jsx

Reads product_data.csv, scans the active InDesign document, and applies text
updates for product text stories that the dry-run matcher marks OK. Skipped
and unsupported rows are written to a CSV report.
*/

var PRODUCT_TEXT_UPDATE_SKIP_MAIN = true;
var PRODUCT_TEXT_UPDATE_CORE = null;
var PRODUCT_TEXT_UPDATE_PENDING_PLANS = null;
var PRODUCT_PRICE_SUPERSCRIPT_SKIP_MAIN = true;
var PRODUCT_PRICE_SUPERSCRIPT_CORE = null;

(function initializeProductTextUpdateCore() {
    if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
        PRODUCT_TEXT_UPDATE_CORE = require("./Dry Run Product Text Updates.jsx");
        return;
    }

    if (typeof File === "undefined" || typeof $ === "undefined") {
        return;
    }

    var coreFile = File(File($.fileName).parent + "/Dry Run Product Text Updates.jsx");

    if (!coreFile.exists) {
        throw new Error("Could not find Dry Run Product Text Updates.jsx next to this script.");
    }

    coreFile.encoding = "UTF-8";
    coreFile.open("r");
    var coreSource = coreFile.read();
    coreFile.close();

    eval(coreSource);

    PRODUCT_TEXT_UPDATE_CORE = {
        analyzeProductText: analyzeProductText,
        buildDryRunRowsForText: buildDryRunRowsForText,
        csvLine: csvLine,
        getReportFolder: getReportFolder,
        getScriptFolder: getScriptFolder,
        getStoryLayerName: getStoryLayerName,
        getStoryPageName: getStoryPageName,
        getStoryTextFrameName: getStoryTextFrameName,
        makeTimestamp: makeTimestamp,
        parseProductDataCsv: parseProductDataCsv,
        readTextFile: readTextFile,
        writeProductDataIssueReport: writeProductDataIssueReport
    };
})();

function initializeProductPriceSuperscriptCore() {
    if (PRODUCT_PRICE_SUPERSCRIPT_CORE) {
        return;
    }

    if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
        PRODUCT_PRICE_SUPERSCRIPT_CORE = require("./Format Product Price Superscripts.jsx");
        return;
    }

    if (typeof File === "undefined" || typeof $ === "undefined") {
        return;
    }

    var formatterFile = File(File($.fileName).parent + "/Format Product Price Superscripts.jsx");

    if (!formatterFile.exists) {
        throw new Error("Could not find Format Product Price Superscripts.jsx next to this script.");
    }

    formatterFile.encoding = "UTF-8";
    formatterFile.open("r");
    var formatterSource = formatterFile.read();
    formatterFile.close();

    eval(formatterSource);

    PRODUCT_PRICE_SUPERSCRIPT_CORE = {
        formatPriceSuperscriptsInStory: formatPriceSuperscriptsInStory
    };
}

function getProductTextUpdateCore() {
    if (!PRODUCT_TEXT_UPDATE_CORE) {
        throw new Error("Product text update core was not loaded.");
    }

    return PRODUCT_TEXT_UPDATE_CORE;
}

function getProductPriceSuperscriptCore() {
    initializeProductPriceSuperscriptCore();

    return PRODUCT_PRICE_SUPERSCRIPT_CORE;
}

function copyApplyRow(dryRunRow, applyStatus, applyNotes) {
    return {
        applyStatus: applyStatus,
        sourceStatus: dryRunRow.status,
        page: dryRunRow.page,
        textFrame: dryRunRow.textFrame,
        layer: dryRunRow.layer,
        itemNumber: dryRunRow.itemNumber,
        displaySize: dryRunRow.displaySize,
        expandedSizes: dryRunRow.expandedSizes,
        itemCodes: dryRunRow.itemCodes,
        currentPrices: dryRunRow.currentPrices,
        currentGiftText: dryRunRow.currentGiftText,
        desiredMode: dryRunRow.desiredMode,
        desiredDiscountPrice: dryRunRow.desiredDiscountPrice,
        desiredOriginalPrice: dryRunRow.desiredOriginalPrice,
        desiredGiftText: dryRunRow.desiredGiftText,
        sourceNotes: dryRunRow.notes,
        applyNotes: applyNotes || "",
        priceFormatCount: "",
        rawText: dryRunRow.rawText,
        updatedText: ""
    };
}

function setApplyRows(plan, applyStatus, applyNotes) {
    var rows = [];
    var i;

    for (i = 0; i < plan.dryRunRows.length; i++) {
        rows.push(copyApplyRow(plan.dryRunRows[i], applyStatus, applyNotes));
    }

    plan.applyRows = rows;
}

function setNonOkApplyRows(plan) {
    var rows = [];
    var i;

    for (i = 0; i < plan.dryRunRows.length; i++) {
        rows.push(copyApplyRow(
            plan.dryRunRows[i],
            "SKIPPED_" + plan.dryRunRows[i].status,
            plan.dryRunRows[i].notes
        ));
    }

    plan.applyRows = rows;
}

function finishApplyPlan(plan, storyStatus, applyStatus, applyNotes) {
    plan.storyStatus = storyStatus;
    setApplyRows(plan, applyStatus, applyNotes);
    return plan;
}

function hasNonOkRows(rows) {
    var i;

    for (i = 0; i < rows.length; i++) {
        if (rows[i].status !== "OK") {
            return true;
        }
    }

    return false;
}

function getFirstTokenOfType(analysis, tokenType) {
    var i;

    for (i = 0; i < analysis.tokens.length; i++) {
        if (analysis.tokens[i].type === tokenType) {
            return analysis.tokens[i];
        }
    }

    return null;
}

function getTokensBefore(analysis, tokenType, endOffset) {
    var tokens = [];
    var i;

    for (i = 0; i < analysis.tokens.length; i++) {
        if (analysis.tokens[i].type === tokenType && analysis.tokens[i].start < endOffset) {
            tokens.push(analysis.tokens[i]);
        }
    }

    return tokens;
}

function buildPriceGroupsForAnalysis(analysis) {
    var firstItemToken = getFirstTokenOfType(analysis, "ITEM_NUMBER");
    var itemStart = firstItemToken ? firstItemToken.start : analysis.rawText.length;
    var sizeTokens = getTokensBefore(analysis, "SIZE", itemStart);
    var priceTokens = getTokensBefore(analysis, "PRICE", itemStart);
    var groups = [];
    var sizeIndex;
    var priceIndex;

    if (sizeTokens.length === 0) {
        groups.push({
            displaySize: "",
            start: 0,
            end: itemStart,
            priceTokens: priceTokens
        });
        return groups;
    }

    for (sizeIndex = 0; sizeIndex < sizeTokens.length; sizeIndex++) {
        var groupEnd = sizeIndex + 1 < sizeTokens.length ? sizeTokens[sizeIndex + 1].start : itemStart;
        var groupPrices = [];

        for (priceIndex = 0; priceIndex < priceTokens.length; priceIndex++) {
            if (priceTokens[priceIndex].start >= sizeTokens[sizeIndex].end && priceTokens[priceIndex].start < groupEnd) {
                groupPrices.push(priceTokens[priceIndex]);
            }
        }

        groups.push({
            displaySize: sizeTokens[sizeIndex].value,
            start: sizeTokens[sizeIndex].start,
            end: groupEnd,
            priceTokens: groupPrices
        });
    }

    return groups;
}

function containsValue(values, value) {
    var i;

    for (i = 0; i < values.length; i++) {
        if (values[i] === value) {
            return true;
        }
    }

    return false;
}

function getUniqueDesiredGiftTexts(rows) {
    var values = [];
    var i;

    for (i = 0; i < rows.length; i++) {
        if (!containsValue(values, rows[i].desiredGiftText)) {
            values.push(rows[i].desiredGiftText);
        }
    }

    return values;
}

function detectLineBreak(text) {
    if (text.indexOf("\r\n") !== -1) {
        return "\r\n";
    }

    if (text.indexOf("\r") !== -1) {
        return "\r";
    }

    return "\n";
}

function addTextEdit(edits, start, end, replacement, reason) {
    edits.push({
        start: start,
        end: end,
        replacement: replacement,
        reason: reason || ""
    });
}

function addReplacementEdit(edits, sourceText, token, replacement, reason) {
    if (replacement === "" || sourceText.substring(token.start, token.end) === replacement) {
        return;
    }

    addTextEdit(edits, token.start, token.end, replacement, reason);
}

function findRegularPriceRemovalRange(text, discountPriceToken, originalPriceToken) {
    var between = text.substring(discountPriceToken.end, originalPriceToken.start);
    var start = originalPriceToken.start;
    var lineMatch = /([ \t]*(?:\r\n|\r|\n)[ \t]*Reg\.?[ \t]*)$/i.exec(between);
    var inlineMatch;

    if (lineMatch) {
        start = discountPriceToken.end + lineMatch.index;
    } else {
        inlineMatch = /([ \t]+Reg\.?[ \t]*)$/i.exec(between);

        if (inlineMatch) {
            start = discountPriceToken.end + inlineMatch.index;
        }
    }

    return {
        start: start,
        end: originalPriceToken.end
    };
}

function findRegaloTokens(text) {
    var tokens = [];
    var pattern = /\bREGALO(?:[ \t]+[A-D])?\b/ig;
    var match;

    while ((match = pattern.exec(text)) !== null) {
        tokens.push({
            start: match.index,
            end: match.index + match[0].length,
            raw: match[0]
        });
    }

    return tokens;
}

function findGiftRemovalRange(text, giftToken) {
    var start = giftToken.start;
    var before = text.substring(0, giftToken.start);
    var lineMatch = /[ \t]*(?:\r\n|\r|\n)[ \t]*$/.exec(before);
    var inlineMatch;

    if (lineMatch) {
        start = giftToken.start - lineMatch[0].length;
    } else {
        inlineMatch = /[ \t]+$/.exec(before);

        if (inlineMatch) {
            start = giftToken.start - inlineMatch[0].length;
        }
    }

    return {
        start: start,
        end: giftToken.end
    };
}

function makeGiftInsertionText(text, itemStart, desiredGiftText) {
    var lineBreak = detectLineBreak(text);
    var previousCharacter = itemStart > 0 ? text.charAt(itemStart - 1) : "";

    if (previousCharacter === "\r" || previousCharacter === "\n") {
        return desiredGiftText + lineBreak;
    }

    if (previousCharacter === " " || previousCharacter === "\t") {
        return desiredGiftText + " ";
    }

    return lineBreak + desiredGiftText + lineBreak;
}

function buildGiftTextEdits(sourceText, analysis, desiredGiftText) {
    var edits = [];
    var giftTokens = findRegaloTokens(sourceText);
    var firstItemToken = getFirstTokenOfType(analysis, "ITEM_NUMBER");
    var i;

    if (desiredGiftText) {
        if (giftTokens.length > 0) {
            for (i = 0; i < giftTokens.length; i++) {
                if (sourceText.substring(giftTokens[i].start, giftTokens[i].end) !== desiredGiftText) {
                    addTextEdit(edits, giftTokens[i].start, giftTokens[i].end, desiredGiftText, "Update REGALO text");
                }
            }
        } else if (firstItemToken) {
            addTextEdit(
                edits,
                firstItemToken.start,
                firstItemToken.start,
                makeGiftInsertionText(sourceText, firstItemToken.start, desiredGiftText),
                "Insert REGALO text"
            );
        }
    } else {
        for (i = 0; i < giftTokens.length; i++) {
            var removalRange = findGiftRemovalRange(sourceText, giftTokens[i]);
            addTextEdit(edits, removalRange.start, removalRange.end, "", "Remove stale REGALO text");
        }
    }

    return edits;
}

function buildPriceEditsForRow(sourceText, row, group) {
    var edits = [];
    var priceTokens = group.priceTokens;
    var regularRange;

    if (priceTokens.length === 0) {
        return {
            ok: false,
            notes: "No price token was found for this product text group.",
            edits: []
        };
    }

    addReplacementEdit(edits, sourceText, priceTokens[0], row.desiredDiscountPrice, "Update discount price");

    if (row.desiredMode === "NO_GIFT_KEEP_REGULAR_PRICE") {
        if (row.desiredOriginalPrice && priceTokens.length < 2) {
            return {
                ok: false,
                notes: "No regular price token was found for this non-gift item.",
                edits: []
            };
        }

        if (row.desiredOriginalPrice && priceTokens.length >= 2) {
            addReplacementEdit(edits, sourceText, priceTokens[1], row.desiredOriginalPrice, "Update regular price");
        }
    } else if (row.desiredMode === "GIFT_REMOVE_REGULAR_PRICE" && priceTokens.length >= 2) {
        regularRange = findRegularPriceRemovalRange(sourceText, priceTokens[0], priceTokens[1]);
        addTextEdit(edits, regularRange.start, regularRange.end, "", "Remove regular price for gift item");
    }

    return {
        ok: true,
        notes: "",
        edits: edits
    };
}

function compareEditsAscending(a, b) {
    if (a.start !== b.start) {
        return a.start - b.start;
    }

    return a.end - b.end;
}

function compareEditsDescending(a, b) {
    if (a.start !== b.start) {
        return b.start - a.start;
    }

    return b.end - a.end;
}

function copyAndValidateTextEdits(edits, textLength) {
    var sorted = [];
    var i;

    for (i = 0; i < edits.length; i++) {
        if (edits[i].start < 0 || edits[i].end < edits[i].start || edits[i].end > textLength) {
            throw new Error("Invalid text edit range: " + edits[i].start + "-" + edits[i].end);
        }

        sorted.push({
            start: edits[i].start,
            end: edits[i].end,
            replacement: edits[i].replacement,
            reason: edits[i].reason || ""
        });
    }

    sorted.sort(compareEditsAscending);

    for (i = 1; i < sorted.length; i++) {
        if (sorted[i - 1].end > sorted[i].start) {
            throw new Error("Overlapping text edit ranges: " + sorted[i - 1].start + "-" + sorted[i - 1].end + " and " + sorted[i].start + "-" + sorted[i].end);
        }
    }

    return sorted;
}

function applyTextEditsToString(text, edits) {
    var sourceText = String(text || "");
    var sorted = copyAndValidateTextEdits(edits, sourceText.length);
    var output = sourceText;
    var i;

    sorted.sort(compareEditsDescending);

    for (i = 0; i < sorted.length; i++) {
        output = output.substring(0, sorted[i].start) + sorted[i].replacement + output.substring(sorted[i].end);
    }

    return output;
}

function appendEdits(target, source) {
    var i;

    for (i = 0; i < source.length; i++) {
        target.push(source[i]);
    }
}

function buildTextUpdatePlan(rawText, productData, context) {
    var core = getProductTextUpdateCore();
    var sourceText = String(rawText || "");
    var analysis = core.analyzeProductText(sourceText);
    var rows = core.buildDryRunRowsForText(sourceText, productData, context || {});
    var plan = {
        storyStatus: "",
        dryRunRows: rows,
        applyRows: [],
        edits: [],
        rawText: sourceText,
        updatedText: sourceText,
        story: null
    };
    var groups;
    var desiredGiftTexts;
    var desiredGiftText;
    var rowIndex;
    var priceResult;
    var giftEdits;

    if (rows.length === 0) {
        plan.storyStatus = "NO_ROWS";
        return plan;
    }

    if (analysis.rawText.length !== sourceText.length) {
        return finishApplyPlan(
            plan,
            "SKIPPED_UNSUPPORTED_LINE_ENDINGS",
            "SKIPPED_UNSUPPORTED_LINE_ENDINGS",
            "Text contains line endings that change length during analysis."
        );
    }

    if (hasNonOkRows(rows)) {
        plan.storyStatus = "SKIPPED_NON_OK_ROW";
        setNonOkApplyRows(plan);
        return plan;
    }

    groups = buildPriceGroupsForAnalysis(analysis);

    if (groups.length !== rows.length) {
        return finishApplyPlan(
            plan,
            "SKIPPED_PATTERN_UNSUPPORTED",
            "SKIPPED_PATTERN_UNSUPPORTED",
            "Could not map dry-run rows to price groups."
        );
    }

    desiredGiftTexts = getUniqueDesiredGiftTexts(rows);

    if (desiredGiftTexts.length > 1) {
        return finishApplyPlan(
            plan,
            "SKIPPED_MIXED_GIFT_TEXT",
            "SKIPPED_MIXED_GIFT_TEXT",
            "One story needs more than one REGALO state; split or review manually."
        );
    }

    desiredGiftText = desiredGiftTexts.length === 1 ? desiredGiftTexts[0] : "";

    for (rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        if (rows[rowIndex].displaySize !== groups[rowIndex].displaySize) {
            return finishApplyPlan(
                plan,
                "SKIPPED_PATTERN_UNSUPPORTED",
                "SKIPPED_PATTERN_UNSUPPORTED",
                "Dry-run display sizes did not align with detected price groups."
            );
        }

        priceResult = buildPriceEditsForRow(sourceText, rows[rowIndex], groups[rowIndex]);

        if (!priceResult.ok) {
            return finishApplyPlan(plan, "SKIPPED_PATTERN_UNSUPPORTED", "SKIPPED_PATTERN_UNSUPPORTED", priceResult.notes);
        }

        appendEdits(plan.edits, priceResult.edits);
    }

    giftEdits = buildGiftTextEdits(sourceText, analysis, desiredGiftText);
    appendEdits(plan.edits, giftEdits);

    try {
        copyAndValidateTextEdits(plan.edits, sourceText.length);
    } catch (error) {
        return finishApplyPlan(plan, "SKIPPED_PATTERN_UNSUPPORTED", "SKIPPED_PATTERN_UNSUPPORTED", error.message);
    }

    plan.updatedText = applyTextEditsToString(sourceText, plan.edits);

    if (plan.edits.length === 0 || plan.updatedText === sourceText) {
        plan.storyStatus = "UNCHANGED";
        setApplyRows(plan, "UNCHANGED", "Document text already matches product data.");
    } else {
        plan.storyStatus = "UPDATED";
        setApplyRows(plan, "UPDATED", "");
    }

    for (rowIndex = 0; rowIndex < plan.applyRows.length; rowIndex++) {
        plan.applyRows[rowIndex].updatedText = plan.updatedText;
    }

    return plan;
}

function applyTextEditsToStory(story, edits) {
    var sorted = copyAndValidateTextEdits(edits, story.contents.length);
    var i;

    sorted.sort(compareEditsDescending);

    for (i = 0; i < sorted.length; i++) {
        if (sorted[i].start === sorted[i].end) {
            story.insertionPoints.item(sorted[i].start).contents = sorted[i].replacement;
        } else {
            story.characters.itemByRange(sorted[i].start, sorted[i].end - 1).contents = sorted[i].replacement;
        }
    }
}

function markPlanApplyError(plan, message) {
    var i;

    plan.storyStatus = "ERROR";

    for (i = 0; i < plan.applyRows.length; i++) {
        if (plan.applyRows[i].applyStatus === "UPDATED") {
            plan.applyRows[i].applyStatus = "ERROR";
            plan.applyRows[i].applyNotes = message;
        }
    }
}

function applyPlansToDocument(plans) {
    var i;
    var formatterCore = getProductPriceSuperscriptCore();

    for (i = 0; i < plans.length; i++) {
        if (plans[i].storyStatus !== "UPDATED" || plans[i].edits.length === 0) {
            continue;
        }

        try {
            applyTextEditsToStory(plans[i].story, plans[i].edits);

            if (formatterCore && formatterCore.formatPriceSuperscriptsInStory) {
                plans[i].priceFormatCount = formatterCore.formatPriceSuperscriptsInStory(plans[i].story);
            }
        } catch (error) {
            markPlanApplyError(plans[i], error.message);
        }
    }
}

function collectApplyPlansFromDocument(doc, productData) {
    var core = getProductTextUpdateCore();
    var plans = [];
    var storyIndex;

    for (storyIndex = 0; storyIndex < doc.stories.length; storyIndex++) {
        var story = doc.stories[storyIndex];
        var analysis = core.analyzeProductText(story.contents);
        var plan;

        if (analysis.itemNumbers.length === 0) {
            continue;
        }

        plan = buildTextUpdatePlan(story.contents, productData, {
            page: core.getStoryPageName(story),
            textFrame: core.getStoryTextFrameName(story),
            layer: core.getStoryLayerName(story)
        });
        plan.story = story;
        plans.push(plan);
    }

    return plans;
}

function countPlansWithStatus(plans, status) {
    var count = 0;
    var i;

    for (i = 0; i < plans.length; i++) {
        if (plans[i].storyStatus === status) {
            count++;
        }
    }

    return count;
}

function countApplyRows(plans) {
    var count = 0;
    var i;

    for (i = 0; i < plans.length; i++) {
        count += plans[i].applyRows.length;
    }

    return count;
}

function countApplyRowsByStatus(plans, status) {
    var count = 0;
    var i;
    var rowIndex;

    for (i = 0; i < plans.length; i++) {
        for (rowIndex = 0; rowIndex < plans[i].applyRows.length; rowIndex++) {
            if (plans[i].applyRows[rowIndex].applyStatus === status) {
                count++;
            }
        }
    }

    return count;
}

function countSkippedApplyRows(plans) {
    var count = 0;
    var i;
    var rowIndex;

    for (i = 0; i < plans.length; i++) {
        for (rowIndex = 0; rowIndex < plans[i].applyRows.length; rowIndex++) {
            if (plans[i].applyRows[rowIndex].applyStatus.indexOf("SKIPPED_") === 0) {
                count++;
            }
        }
    }

    return count;
}

function writeApplyReport(plans, reportFile) {
    var core = getProductTextUpdateCore();
    var lines = [
        core.csvLine([
            "Apply Status",
            "Source Status",
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
            "Source Notes",
            "Apply Notes",
            "Price Format Count",
            "Raw Text",
            "Updated Text"
        ])
    ];
    var i;
    var rowIndex;

    for (i = 0; i < plans.length; i++) {
        for (rowIndex = 0; rowIndex < plans[i].applyRows.length; rowIndex++) {
            var row = plans[i].applyRows[rowIndex];

            lines.push(core.csvLine([
                row.applyStatus,
                row.sourceStatus,
                row.page,
                row.textFrame,
                row.layer,
                row.itemNumber,
                row.displaySize,
                row.expandedSizes,
                row.itemCodes,
                row.currentPrices,
                row.currentGiftText,
                row.desiredMode,
                row.desiredDiscountPrice,
                row.desiredOriginalPrice,
                row.desiredGiftText,
                row.sourceNotes,
                row.applyNotes,
                plans[i].priceFormatCount || row.priceFormatCount,
                row.rawText,
                row.updatedText
            ]));
        }
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function applyProductTextUpdatesMain() {
    var core = getProductTextUpdateCore();

    if (app.documents.length === 0) {
        alert("Open an InDesign document before running this script.");
        return;
    }

    var scriptFolder = core.getScriptFolder();
    var dataFile = File(scriptFolder + "/product_data.csv");

    if (!dataFile.exists) {
        alert("Could not find product_data.csv next to this script:\r" + dataFile.fsName);
        return;
    }

    var productData = core.parseProductDataCsv(core.readTextFile(dataFile));
    var doc = app.activeDocument;
    var reportFolder = core.getReportFolder(doc);
    var timestamp = core.makeTimestamp(new Date());
    var applyReportFile = File(reportFolder + "/Product Text Update Apply " + timestamp + ".csv");
    var issuesFile = File(reportFolder + "/Product Data Issues " + timestamp + ".csv");

    core.writeProductDataIssueReport(productData, issuesFile);

    if (productData.errors.length > 0) {
        alert(
            "Product data has " + productData.errors.length + " error(s). No document text was changed.\r\r" +
            "Product data issues:\r" + issuesFile.fsName
        );
        return;
    }

    var plans = collectApplyPlansFromDocument(doc, productData);
    var rowsToUpdate = countApplyRowsByStatus(plans, "UPDATED");
    var rowsUnchanged = countApplyRowsByStatus(plans, "UNCHANGED");
    var rowsSkipped = countSkippedApplyRows(plans);
    var storiesToChange = countPlansWithStatus(plans, "UPDATED");

    if (storiesToChange === 0) {
        writeApplyReport(plans, applyReportFile);
        alert(
            "No product text changes were applied.\r\r" +
            "Rows: " + countApplyRows(plans) + "\r" +
            "Unchanged rows: " + rowsUnchanged + "\r" +
            "Skipped rows: " + rowsSkipped + "\r\r" +
            "Apply report:\r" + applyReportFile.fsName + "\r\r" +
            "Product data issues:\r" + issuesFile.fsName
        );
        return;
    }

    if (!confirm(
        "Apply product text updates?\r\r" +
        "Stories to change: " + storiesToChange + "\r" +
        "Rows to update: " + rowsToUpdate + "\r" +
        "Rows unchanged: " + rowsUnchanged + "\r" +
        "Rows skipped: " + rowsSkipped + "\r\r" +
        "Save a backup before continuing if you have not already."
    )) {
        return;
    }

    if (typeof app.doScript === "function" && typeof ScriptLanguage !== "undefined" && typeof UndoModes !== "undefined") {
        PRODUCT_TEXT_UPDATE_PENDING_PLANS = plans;

        try {
            app.doScript(
                "applyPlansToDocument(PRODUCT_TEXT_UPDATE_PENDING_PLANS);",
                ScriptLanguage.JAVASCRIPT,
                undefined,
                UndoModes.ENTIRE_SCRIPT,
                "Apply Product Text Updates"
            );
        } finally {
            PRODUCT_TEXT_UPDATE_PENDING_PLANS = null;
        }
    } else {
        applyPlansToDocument(plans);
    }

    writeApplyReport(plans, applyReportFile);

    alert(
        "Product text update run complete.\r\r" +
        "Rows: " + countApplyRows(plans) + "\r" +
        "Updated rows: " + countApplyRowsByStatus(plans, "UPDATED") + "\r" +
        "Unchanged rows: " + countApplyRowsByStatus(plans, "UNCHANGED") + "\r" +
        "Skipped rows: " + countSkippedApplyRows(plans) + "\r" +
        "Errors: " + countApplyRowsByStatus(plans, "ERROR") + "\r\r" +
        "Apply report:\r" + applyReportFile.fsName + "\r\r" +
        "Product data issues:\r" + issuesFile.fsName
    );
}

if (typeof app !== "undefined") {
    applyProductTextUpdatesMain();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        applyTextEditsToString: applyTextEditsToString,
        buildPriceGroupsForAnalysis: buildPriceGroupsForAnalysis,
        buildTextUpdatePlan: buildTextUpdatePlan,
        findRegaloTokens: findRegaloTokens
    };
}
