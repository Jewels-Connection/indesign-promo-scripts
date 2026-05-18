/*
Format Product Price Superscripts.jsx

Shared price superscript formatting logic. Running this file directly performs
a dry run only. Use Apply Product Price Superscripts.jsx for actual changes.
*/

var PRODUCT_PRICE_SUPERSCRIPT_PENDING_ROWS = null;
var PRODUCT_PRICE_SUPERSCRIPT_RESULT = null;

function padPriceSuperscriptNumber(value, width) {
    var output = String(value);

    while (output.length < width) {
        output = "0" + output;
    }

    return output;
}

function findPriceSuperscriptRangesForText(text) {
    var source = String(text || "");
    var ranges = [];
    var pattern = /\$[ \t]*[0-9][0-9,]*(?:\.[0-9][0-9])?/g;
    var match;

    while ((match = pattern.exec(source)) !== null) {
        var raw = match[0];
        var digitPositions = [];
        var i;

        for (i = 0; i < raw.length; i++) {
            if (/[0-9]/.test(raw.charAt(i))) {
                digitPositions.push(match.index + i);
            }
        }

        if (digitPositions.length < 2) {
            continue;
        }

        var superscriptStart = digitPositions[digitPositions.length - 2];
        var superscriptEnd = digitPositions[digitPositions.length - 1] + 1;

        ranges.push({
            priceText: raw,
            priceStart: match.index,
            priceEnd: match.index + raw.length,
            normalStart: match.index,
            normalEnd: superscriptStart,
            superscriptStart: superscriptStart,
            superscriptEnd: superscriptEnd,
            normalText: source.substring(match.index, superscriptStart),
            superscriptText: source.substring(superscriptStart, superscriptEnd)
        });
    }

    return ranges;
}

function summarizePriceSuperscriptRanges(ranges) {
    var values = [];
    var i;

    for (i = 0; i < ranges.length; i++) {
        values.push(ranges[i].priceText);
    }

    return values.join(" | ");
}

function uniquePriceSuperscriptValues(values) {
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

function summarizePriceSuperscriptPositions(values) {
    return uniquePriceSuperscriptValues(values).join(" | ");
}

function priceSuperscriptPositionName(positionValue) {
    try {
        if (typeof Position !== "undefined") {
            if (positionValue === Position.NORMAL) {
                return "NORMAL";
            }

            if (positionValue === Position.SUPERSCRIPT) {
                return "SUPERSCRIPT";
            }

            if (positionValue === Position.SUBSCRIPT) {
                return "SUBSCRIPT";
            }
        }
    } catch (error) {
        // Fall through to string reporting.
    }

    var source = String(positionValue);
    var upper = source.toUpperCase();

    if (upper.indexOf("SUPERSCRIPT") !== -1) {
        return "SUPERSCRIPT";
    }

    if (upper.indexOf("SUBSCRIPT") !== -1) {
        return "SUBSCRIPT";
    }

    if (upper.indexOf("NORMAL") !== -1) {
        return "NORMAL";
    }

    return source;
}

function allPriceSuperscriptPositionsMatch(values, expected) {
    var i;

    if (values.length === 0) {
        return false;
    }

    for (i = 0; i < values.length; i++) {
        if (priceSuperscriptPositionName(values[i]) !== expected) {
            return false;
        }
    }

    return true;
}

function getPriceSuperscriptStatus(normalPositions, superscriptPositions) {
    if (
        allPriceSuperscriptPositionsMatch(normalPositions, "NORMAL") &&
        allPriceSuperscriptPositionsMatch(superscriptPositions, "SUPERSCRIPT")
    ) {
        return "OK";
    }

    return "NEEDS_FORMATTING";
}

function buildPriceSuperscriptRowsForText(text, context, positionProvider) {
    var source = String(text || "");
    var ranges = findPriceSuperscriptRangesForText(source);
    var rows = [];
    var i;

    for (i = 0; i < ranges.length; i++) {
        var normalPositions = [];
        var superscriptPositions = [];
        var status = "NEEDS_FORMATTING";
        var notes = "";

        if (positionProvider) {
            try {
                normalPositions = positionProvider(ranges[i].normalStart, ranges[i].normalEnd, "normal");
                superscriptPositions = positionProvider(ranges[i].superscriptStart, ranges[i].superscriptEnd, "superscript");
                status = getPriceSuperscriptStatus(normalPositions, superscriptPositions);
            } catch (error) {
                status = "ERROR";
                notes = error.message;
            }
        }

        rows.push({
            story: context.story || null,
            storyIndex: context.storyIndex || "",
            status: status,
            applyStatus: "",
            page: context.page || "",
            textFrame: context.textFrame || "",
            layer: context.layer || "",
            priceText: ranges[i].priceText,
            normalText: ranges[i].normalText,
            superscriptText: ranges[i].superscriptText,
            normalPositions: summarizePriceSuperscriptPositions(normalPositions),
            superscriptPositions: summarizePriceSuperscriptPositions(superscriptPositions),
            notes: notes,
            rawText: source,
            range: ranges[i]
        });
    }

    return rows;
}

function getStoryFirstTextContainerForPriceFormat(story) {
    try {
        if (story.textContainers && story.textContainers.length > 0) {
            return story.textContainers[0];
        }
    } catch (error) {
        return null;
    }

    return null;
}

function getStoryPageNameForPriceFormat(story) {
    var container = getStoryFirstTextContainerForPriceFormat(story);

    try {
        if (container && container.parentPage) {
            return container.parentPage.name;
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getStoryTextFrameNameForPriceFormat(story) {
    var container = getStoryFirstTextContainerForPriceFormat(story);

    try {
        if (container) {
            return container.name || "";
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getStoryLayerNameForPriceFormat(story) {
    var container = getStoryFirstTextContainerForPriceFormat(story);

    try {
        if (container && container.itemLayer) {
            return container.itemLayer.name;
        }
    } catch (error) {
        return "";
    }

    return "";
}

function readPriceSuperscriptPositionNames(story, start, end) {
    var positions = [];
    var i;

    for (i = start; i < end; i++) {
        positions.push(priceSuperscriptPositionName(story.characters.item(i).position));
    }

    return positions;
}

function escapePriceFormatCsv(value) {
    var source = String(value === undefined || value === null ? "" : value);
    return "\"" + source.replace(/"/g, "\"\"") + "\"";
}

function priceFormatCsvLine(values) {
    var escaped = [];
    var i;

    for (i = 0; i < values.length; i++) {
        escaped.push(escapePriceFormatCsv(values[i]));
    }

    return escaped.join(",");
}

function makePriceSuperscriptTimestamp(date) {
    return [
        date.getFullYear(),
        padPriceSuperscriptNumber(date.getMonth() + 1, 2),
        padPriceSuperscriptNumber(date.getDate(), 2)
    ].join("-") + "_" + [
        padPriceSuperscriptNumber(date.getHours(), 2),
        padPriceSuperscriptNumber(date.getMinutes(), 2),
        padPriceSuperscriptNumber(date.getSeconds(), 2)
    ].join("-");
}

function getPriceSuperscriptReportFolder(doc) {
    try {
        if (doc.saved && doc.filePath) {
            return doc.filePath;
        }
    } catch (error) {
        // Fall through to desktop.
    }

    return Folder.desktop;
}

function setPriceRangePosition(story, start, end, positionValue) {
    if (end <= start) {
        return;
    }

    story.characters.itemByRange(start, end - 1).position = positionValue;
}

function formatPriceSuperscriptRange(story, range) {
    setPriceRangePosition(story, range.normalStart, range.normalEnd, Position.NORMAL);
    setPriceRangePosition(story, range.superscriptStart, range.superscriptEnd, Position.SUPERSCRIPT);
}

function formatPriceSuperscriptsInStory(story) {
    var ranges = findPriceSuperscriptRangesForText(story.contents);
    var i;

    for (i = 0; i < ranges.length; i++) {
        formatPriceSuperscriptRange(story, ranges[i]);
    }

    return ranges.length;
}

function collectPriceSuperscriptRowsFromDocument(doc) {
    var rows = [];
    var storyIndex;

    for (storyIndex = 0; storyIndex < doc.stories.length; storyIndex++) {
        var story = doc.stories[storyIndex];
        var storyRows = buildPriceSuperscriptRowsForText(story.contents, {
            story: story,
            storyIndex: storyIndex,
            page: getStoryPageNameForPriceFormat(story),
            textFrame: getStoryTextFrameNameForPriceFormat(story),
            layer: getStoryLayerNameForPriceFormat(story)
        }, function (start, end) {
            return readPriceSuperscriptPositionNames(story, start, end);
        });
        var rowIndex;

        for (rowIndex = 0; rowIndex < storyRows.length; rowIndex++) {
            rows.push(storyRows[rowIndex]);
        }
    }

    return rows;
}

function writePriceSuperscriptDryRunReport(rows, reportFile) {
    var lines = [
        priceFormatCsvLine([
            "Status",
            "Page",
            "Text Frame",
            "Layer",
            "Price",
            "Normal Portion",
            "Superscript Portion",
            "Normal Current Position",
            "Superscript Current Position",
            "Notes",
            "Raw Text"
        ])
    ];
    var i;

    for (i = 0; i < rows.length; i++) {
        lines.push(priceFormatCsvLine([
            rows[i].status,
            rows[i].page,
            rows[i].textFrame,
            rows[i].layer,
            rows[i].priceText,
            rows[i].normalText,
            rows[i].superscriptText,
            rows[i].normalPositions,
            rows[i].superscriptPositions,
            rows[i].notes,
            rows[i].rawText
        ]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function writePriceSuperscriptApplyReport(rows, reportFile) {
    var lines = [
        priceFormatCsvLine([
            "Apply Status",
            "Dry Run Status",
            "Page",
            "Text Frame",
            "Layer",
            "Price",
            "Normal Portion",
            "Superscript Portion",
            "Normal Current Position",
            "Superscript Current Position",
            "Notes",
            "Raw Text"
        ])
    ];
    var i;

    for (i = 0; i < rows.length; i++) {
        lines.push(priceFormatCsvLine([
            rows[i].applyStatus,
            rows[i].status,
            rows[i].page,
            rows[i].textFrame,
            rows[i].layer,
            rows[i].priceText,
            rows[i].normalText,
            rows[i].superscriptText,
            rows[i].normalPositions,
            rows[i].superscriptPositions,
            rows[i].notes,
            rows[i].rawText
        ]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function countPriceSuperscriptRowsByStatus(rows, statusField, status) {
    var count = 0;
    var i;

    for (i = 0; i < rows.length; i++) {
        if (rows[i][statusField] === status) {
            count++;
        }
    }

    return count;
}

function applyPriceSuperscriptsToRows(rows) {
    var formattedCount = 0;
    var unchangedCount = 0;
    var errorCount = 0;
    var i;

    for (i = 0; i < rows.length; i++) {
        if (rows[i].status === "OK") {
            rows[i].applyStatus = "UNCHANGED";
            unchangedCount++;
            continue;
        }

        if (rows[i].status === "ERROR") {
            rows[i].applyStatus = "SKIPPED_ERROR";
            errorCount++;
            continue;
        }

        try {
            formatPriceSuperscriptRange(rows[i].story, rows[i].range);
            rows[i].applyStatus = "FORMATTED";
            formattedCount++;
        } catch (error) {
            rows[i].applyStatus = "ERROR";
            rows[i].notes = error.message;
            errorCount++;
        }
    }

    return {
        formattedCount: formattedCount,
        unchangedCount: unchangedCount,
        errorCount: errorCount
    };
}

function dryRunProductPriceSuperscriptsMain() {
    if (app.documents.length === 0) {
        alert("Open an InDesign document before running this script.");
        return;
    }

    var doc = app.activeDocument;
    var rows = collectPriceSuperscriptRowsFromDocument(doc);
    var reportFolder = getPriceSuperscriptReportFolder(doc);
    var timestamp = makePriceSuperscriptTimestamp(new Date());
    var reportFile = File(reportFolder + "/Product Price Superscript Dry Run " + timestamp + ".csv");

    writePriceSuperscriptDryRunReport(rows, reportFile);

    alert(
        "Price superscript dry run complete.\r\r" +
        "Prices found: " + rows.length + "\r" +
        "Already OK: " + countPriceSuperscriptRowsByStatus(rows, "status", "OK") + "\r" +
        "Need formatting: " + countPriceSuperscriptRowsByStatus(rows, "status", "NEEDS_FORMATTING") + "\r" +
        "Errors: " + countPriceSuperscriptRowsByStatus(rows, "status", "ERROR") + "\r\r" +
        "Dry run:\r" + reportFile.fsName
    );
}

function applyProductPriceSuperscriptsMain() {
    if (app.documents.length === 0) {
        alert("Open an InDesign document before running this script.");
        return;
    }

    var doc = app.activeDocument;
    var rows = collectPriceSuperscriptRowsFromDocument(doc);
    var reportFolder = getPriceSuperscriptReportFolder(doc);
    var timestamp = makePriceSuperscriptTimestamp(new Date());
    var reportFile = File(reportFolder + "/Product Price Superscript Apply " + timestamp + ".csv");
    var needsFormatting = countPriceSuperscriptRowsByStatus(rows, "status", "NEEDS_FORMATTING");
    var result;

    if (needsFormatting === 0) {
        result = applyPriceSuperscriptsToRows(rows);
        writePriceSuperscriptApplyReport(rows, reportFile);
        alert(
            "No price superscript changes were needed.\r\r" +
            "Prices found: " + rows.length + "\r" +
            "Already OK: " + result.unchangedCount + "\r" +
            "Errors: " + result.errorCount + "\r\r" +
            "Apply report:\r" + reportFile.fsName
        );
        return;
    }

    if (!confirm(
        "Apply price superscript formatting?\r\r" +
        "Prices found: " + rows.length + "\r" +
        "Need formatting: " + needsFormatting + "\r" +
        "Already OK: " + countPriceSuperscriptRowsByStatus(rows, "status", "OK") + "\r" +
        "Errors: " + countPriceSuperscriptRowsByStatus(rows, "status", "ERROR") + "\r\r" +
        "Save a backup before continuing if you have not already."
    )) {
        return;
    }

    if (typeof app.doScript === "function" && typeof ScriptLanguage !== "undefined" && typeof UndoModes !== "undefined") {
        PRODUCT_PRICE_SUPERSCRIPT_PENDING_ROWS = rows;
        PRODUCT_PRICE_SUPERSCRIPT_RESULT = null;

        try {
            app.doScript(
                "PRODUCT_PRICE_SUPERSCRIPT_RESULT = applyPriceSuperscriptsToRows(PRODUCT_PRICE_SUPERSCRIPT_PENDING_ROWS);",
                ScriptLanguage.JAVASCRIPT,
                undefined,
                UndoModes.ENTIRE_SCRIPT,
                "Apply Product Price Superscripts"
            );
            result = PRODUCT_PRICE_SUPERSCRIPT_RESULT;
        } finally {
            PRODUCT_PRICE_SUPERSCRIPT_PENDING_ROWS = null;
            PRODUCT_PRICE_SUPERSCRIPT_RESULT = null;
        }
    } else {
        result = applyPriceSuperscriptsToRows(rows);
    }

    writePriceSuperscriptApplyReport(rows, reportFile);

    alert(
        "Price superscript apply complete.\r\r" +
        "Prices found: " + rows.length + "\r" +
        "Formatted: " + result.formattedCount + "\r" +
        "Unchanged: " + result.unchangedCount + "\r" +
        "Errors: " + result.errorCount + "\r\r" +
        "Apply report:\r" + reportFile.fsName
    );
}

if (typeof app !== "undefined" && typeof PRODUCT_PRICE_SUPERSCRIPT_SKIP_MAIN === "undefined") {
    dryRunProductPriceSuperscriptsMain();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        applyPriceSuperscriptsToRows: applyPriceSuperscriptsToRows,
        buildPriceSuperscriptRowsForText: buildPriceSuperscriptRowsForText,
        findPriceSuperscriptRangesForText: findPriceSuperscriptRangesForText,
        formatPriceSuperscriptsInStory: formatPriceSuperscriptsInStory,
        getPriceSuperscriptStatus: getPriceSuperscriptStatus,
        priceSuperscriptPositionName: priceSuperscriptPositionName,
        summarizePriceSuperscriptRanges: summarizePriceSuperscriptRanges
    };
}
