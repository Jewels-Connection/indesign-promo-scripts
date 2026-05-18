/*
Item Metric Boxes.jsx

Shared dry-run/apply logic for adding compact metric boxes below item numbers.
Running this file directly performs a dry run only. Use Apply Item Metric
Boxes.jsx for actual changes.
*/

var ITEM_METRIC_BOX_LABEL_PREFIX = "CATALOG_ITEM_METRIC_BOX";
var ITEM_METRIC_BOX_LAYER_NAME = "Catalog Item Metric Boxes";
var ITEM_METRIC_BOX_PENDING_ROWS = null;
var ITEM_METRIC_BOX_RESULT = null;
var ITEM_METRIC_BOX_HEIGHT_PT = 31;
var ITEM_METRIC_BOX_ROW_HEIGHT_PT = 10;
var ITEM_METRIC_BOX_GAP_PT = 2;
var ITEM_METRIC_BOX_OFFSET_BELOW_ITEM_PT = 1.5;
var ITEM_METRIC_BOX_FONT_SIZE_PT = 14;
var ITEM_METRIC_BOX_LEADING_PT = 10;
var ITEM_METRIC_BOX_FONT_STYLE = "Bold";
var ITEM_METRIC_BOXES_PER_ITEM = 1;
var ITEM_METRIC_BOX_PAGE_EDGE_PADDING_PT = 0;
var ITEM_METRIC_BOX_CHAR_WIDTH_PT = 6;
var ITEM_METRIC_BOX_DEFAULT_PADDING_PT = 3;
var ITEM_METRIC_BOX_SALES_PADDING_PT = 3;
var ITEM_METRIC_BOX_SALES_MIN_WIDTH_PT = 20;
var ITEM_METRIC_BOX_SALES_MAX_WIDTH_PT = 140;
var ITEM_METRIC_BOX_ON_HAND_MIN_WIDTH_PT = 12;
var ITEM_METRIC_BOX_ON_HAND_MAX_WIDTH_PT = 21;
var ITEM_METRIC_BOX_WEIGHT_MIN_WIDTH_PT = 20;
var ITEM_METRIC_BOX_WEIGHT_MAX_WIDTH_PT = 33;

if (typeof ITEM_METRIC_BOX_APPLY_LIMIT === "undefined") {
    var ITEM_METRIC_BOX_APPLY_LIMIT = 0;
}

function withItemMetricPointUnits(callback) {
    var originalUnit;
    var changed = false;

    if (typeof app === "undefined" || typeof MeasurementUnits === "undefined") {
        return callback();
    }

    try {
        originalUnit = app.scriptPreferences.measurementUnit;
        app.scriptPreferences.measurementUnit = MeasurementUnits.POINTS;
        changed = true;
    } catch (error) {
        changed = false;
    }

    try {
        return callback();
    } finally {
        if (changed) {
            try {
                app.scriptPreferences.measurementUnit = originalUnit;
            } catch (restoreError) {
                // Leave InDesign in its current unit state if restore fails.
            }
        }
    }
}

function trimMetricText(value) {
    return String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "");
}

function padMetricNumber(value, width) {
    var output = String(value);

    while (output.length < width) {
        output = "0" + output;
    }

    return output;
}

function parseMetricCsv(text) {
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

function normalizeMetricHeader(header) {
    return trimMetricText(header).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getMetricColumnIndex(headers, aliases) {
    var normalizedAliases = {};
    var i;

    for (i = 0; i < aliases.length; i++) {
        normalizedAliases[normalizeMetricHeader(aliases[i])] = true;
    }

    for (i = 0; i < headers.length; i++) {
        if (normalizedAliases[normalizeMetricHeader(headers[i])]) {
            return i;
        }
    }

    return -1;
}

function normalizeMetricItemCode(value) {
    return trimMetricText(value).replace(/^#\s*/, "").toUpperCase();
}

function normalizeItemRoot(value) {
    var itemCode = normalizeMetricItemCode(value);
    var match = /^(.+?)-([0-9]+(?:\.[0-9]+)?(?:-[0-9]+(?:\.[0-9]+)?)?)$/.exec(itemCode);

    if (match) {
        return match[1];
    }

    return itemCode;
}

function getBaseItemRootFallback(itemRoot) {
    var value = normalizeMetricItemCode(itemRoot);
    var dashIndex = value.indexOf("-");

    if (dashIndex === -1) {
        return "";
    }

    return value.substring(0, dashIndex);
}

function formatMetricValue(value) {
    var output = trimMetricText(value);

    if (/^-?[0-9][0-9,]*\.[0-9]+$/.test(output)) {
        output = output.replace(/0+$/, "").replace(/\.$/, "");
    }

    return output;
}

function metricRecordsEquivalent(a, b) {
    return a &&
        b &&
        a.last365DaysSales === b.last365DaysSales &&
        a.unitsLast365 === b.unitsLast365 &&
        a.countOnHand === b.countOnHand &&
        a.itemAvgWeight === b.itemAvgWeight;
}

function parseItemMetricCsv(csvText) {
    var parsedRows = parseMetricCsv(csvText);
    var result = {
        validRows: [],
        blankRows: [],
        errors: [],
        duplicates: [],
        recordsByRoot: {}
    };

    if (parsedRows.length === 0) {
        result.errors.push("CSV is empty");
        return result;
    }

    var headers = parsedRows[0];
    var rootIndex = getMetricColumnIndex(headers, ["ItemRoot", "Item Root", "ParentItem", "Parent Item", "ItemNumber", "Item Number"]);
    var salesIndex = getMetricColumnIndex(headers, ["DollarsLast365", "Dollars Last 365", "Last365Dollars", "Last 365 Dollars", "Last 365 Days Dollars", "Last365DaysSales", "Last 365 Days Sales", "Sales365", "365 Sales"]);
    var unitsIndex = getMetricColumnIndex(headers, ["UnitsLast365", "Units Last 365", "Last365Units", "Last 365 Units", "Last 365 Days Units", "UnitsSoldLast365", "Units Sold Last 365", "Units Sold Last 365 Days", "Last365DaysUnits", "365 Units", "Units365"]);
    var onHandIndex = getMetricColumnIndex(headers, ["CountOnHand", "Count On Hand", "OnHand", "On Hand", "OH"]);
    var weightIndex = getMetricColumnIndex(headers, ["ItemAvgWeight", "Item Avg Weight", "AvgWeight", "Average Weight", "Weight"]);
    var seen = {};
    var rowIndex;

    if (rootIndex === -1 || salesIndex === -1 || unitsIndex === -1 || onHandIndex === -1 || weightIndex === -1) {
        result.errors.push("CSV must include ItemRoot, DollarsLast365 or Last365DaysSales, UnitsLast365, CountOnHand, and ItemAvgWeight columns");
        return result;
    }

    for (rowIndex = 1; rowIndex < parsedRows.length; rowIndex++) {
        var row = parsedRows[rowIndex];
        var itemRoot = normalizeItemRoot(row[rootIndex]);
        var last365DaysSales = formatMetricValue(row[salesIndex]);
        var unitsLast365 = formatMetricValue(row[unitsIndex]);
        var countOnHand = formatMetricValue(row[onHandIndex]);
        var itemAvgWeight = formatMetricValue(row[weightIndex]);

        if (itemRoot === "" && last365DaysSales === "" && unitsLast365 === "" && countOnHand === "" && itemAvgWeight === "") {
            result.blankRows.push(rowIndex + 1);
            continue;
        }

        if (itemRoot === "" || last365DaysSales === "" || unitsLast365 === "" || countOnHand === "" || itemAvgWeight === "") {
            result.errors.push("Row " + (rowIndex + 1) + " is missing ItemRoot, DollarsLast365 or Last365DaysSales, UnitsLast365, CountOnHand, or ItemAvgWeight");
            continue;
        }

        var record = {
            sourceRow: rowIndex + 1,
            itemRoot: itemRoot,
            last365DaysSales: last365DaysSales,
            unitsLast365: unitsLast365,
            countOnHand: countOnHand,
            itemAvgWeight: itemAvgWeight
        };

        result.validRows.push(record);

        if (seen[itemRoot]) {
            result.duplicates.push(itemRoot);

            if (metricRecordsEquivalent(result.recordsByRoot[itemRoot], record)) {
                continue;
            }

            result.errors.push("Duplicate ItemRoot with conflicting values: " + itemRoot);
            continue;
        }

        seen[itemRoot] = true;
        result.recordsByRoot[itemRoot] = record;
    }

    return result;
}

function extractMetricItemNumbersFromText(text) {
    var results = [];
    var source = String(text || "");
    var pattern = /(^|[^\w])#\s*([A-Za-z0-9][A-Za-z0-9._\/-]*)/g;
    var match;

    while ((match = pattern.exec(source)) !== null) {
        var prefixLength = match[1].length;
        var start = match.index + prefixLength;
        var raw = match[0].substr(prefixLength);

        results.push({
            itemNumber: normalizeMetricItemCode(match[2]),
            itemRoot: normalizeItemRoot(match[2]),
            start: start,
            end: start + raw.length,
            raw: raw
        });
    }

    return results;
}

function makeItemMetricRow(context, match, status, record, notes) {
    return {
        status: status,
        applyStatus: "",
        page: context.page || "",
        textFrame: context.textFrame || "",
        layer: context.layer || "",
        storyIndex: context.storyIndex || "",
        itemNumber: match ? match.itemNumber : "",
        itemRoot: match ? match.itemRoot : "",
        itemStart: match ? match.start : "",
        itemEnd: match ? match.end : "",
        last365DaysSales: record ? record.last365DaysSales : "",
        unitsLast365: record ? record.unitsLast365 : "",
        countOnHand: record ? record.countOnHand : "",
        itemAvgWeight: record ? record.itemAvgWeight : "",
        anchorX: context.anchorX || "",
        anchorY: context.anchorY || "",
        boxHeightPt: "",
        boxTotalWidthPt: "",
        proposedBoxBounds: "",
        notes: notes || "",
        rawText: context.rawText || "",
        story: context.story || null,
        pageRef: context.pageRef || null,
        metricRecord: record || null
    };
}

function resolveItemMetricRecord(match, metricData) {
    var itemRoot = match.itemRoot;
    var record = metricData.recordsByRoot[itemRoot];
    var baseRoot;

    if (record) {
        return {
            itemRoot: itemRoot,
            record: record,
            notes: ""
        };
    }

    baseRoot = getBaseItemRootFallback(itemRoot);

    if (baseRoot && metricData.recordsByRoot[baseRoot]) {
        return {
            itemRoot: baseRoot,
            record: metricData.recordsByRoot[baseRoot],
            notes: "Used base item root fallback from " + itemRoot
        };
    }

    return {
        itemRoot: itemRoot,
        record: null,
        notes: ""
    };
}

function buildItemMetricRowsForText(rawText, metricData, context) {
    var matches = extractMetricItemNumbersFromText(rawText);
    var rows = [];
    var rowContext = context || {};
    var i;

    rowContext.rawText = String(rawText || "");

    if (matches.length === 0) {
        return rows;
    }

    for (i = 0; i < matches.length; i++) {
        var resolved = resolveItemMetricRecord(matches[i], metricData);
        var record = resolved.record;
        var resolvedMatch = {
            itemNumber: matches[i].itemNumber,
            itemRoot: resolved.itemRoot,
            start: matches[i].start,
            end: matches[i].end,
            raw: matches[i].raw
        };

        if (!record) {
            rows.push(makeItemMetricRow(rowContext, resolvedMatch, "MISSING_METRIC_DATA", null, "Missing metrics for item root " + matches[i].itemRoot));
        } else {
            rows.push(makeItemMetricRow(rowContext, resolvedMatch, "OK", record, resolved.notes));
        }
    }

    return rows;
}

function metricBoxWidthForKind(kind, text) {
    var value = String(text || "");
    var minWidth = ITEM_METRIC_BOX_ON_HAND_MIN_WIDTH_PT;
    var maxWidth = ITEM_METRIC_BOX_ON_HAND_MAX_WIDTH_PT;
    var padding = ITEM_METRIC_BOX_DEFAULT_PADDING_PT;
    var width;

    if (kind === "Last365DaysSales") {
        minWidth = ITEM_METRIC_BOX_SALES_MIN_WIDTH_PT;
        maxWidth = ITEM_METRIC_BOX_SALES_MAX_WIDTH_PT;
        padding = ITEM_METRIC_BOX_SALES_PADDING_PT;
    } else if (kind === "ItemAvgWeight") {
        minWidth = ITEM_METRIC_BOX_WEIGHT_MIN_WIDTH_PT;
        maxWidth = ITEM_METRIC_BOX_WEIGHT_MAX_WIDTH_PT;
    }

    width = Math.max(minWidth, value.length * ITEM_METRIC_BOX_CHAR_WIDTH_PT + padding);

    if (width > maxWidth) {
        return maxWidth;
    }

    return width;
}

function formatMetricDollars(value) {
    var output = formatMetricValue(value);

    if (output === "" || output.charAt(0) === "$") {
        return output;
    }

    return "$" + output;
}

function formatMetricSalesUnits(record) {
    return formatMetricDollars(record.last365DaysSales) + " / " + formatMetricValue(record.unitsLast365);
}

function buildMetricBoxPlans(anchor, record) {
    var y1 = anchor.y;
    var x = anchor.x;
    var height = ITEM_METRIC_BOX_HEIGHT_PT;
    var salesUnitsText = formatMetricSalesUnits(record);
    var definitions = [
        {
            kind: "Last365DaysSales",
            text: salesUnitsText,
            fillSwatchName: "Metric Sales Blue",
            rgb: [0, 112, 192]
        },
        {
            kind: "CountOnHand",
            text: record.countOnHand,
            fillSwatchName: "Metric On Hand Green",
            rgb: [0, 153, 76]
        },
        {
            kind: "ItemAvgWeight",
            text: record.itemAvgWeight,
            fillSwatchName: "Metric Weight Orange",
            rgb: [242, 140, 40]
        }
    ];
    var width = 0;
    var i;

    for (i = 0; i < definitions.length; i++) {
        var metricWidth = metricBoxWidthForKind(definitions[i].kind, definitions[i].text);

        if (metricWidth > width) {
            width = metricWidth;
        }
    }

    return [
        {
            kind: "StackedMetrics",
            text: [
                salesUnitsText,
                record.countOnHand,
                record.itemAvgWeight
            ].join("\r"),
            fillSwatchName: "Metric Background White",
            rgb: [255, 255, 255],
            textSwatchNames: [
                "Metric Sales Blue",
                "Metric On Hand Green",
                "Metric Weight Red"
            ],
            textRgbValues: [
                [0, 112, 192],
                [0, 153, 76],
                [220, 0, 0]
            ],
            geometricBounds: [y1, x, y1 + height, x + width]
        }
    ];
}

function summarizeMetricBoxPlanBounds(plans) {
    var values = [];
    var i;

    for (i = 0; i < plans.length; i++) {
        values.push(plans[i].kind + " [" + plans[i].geometricBounds.join(" ") + "]");
    }

    return values.join(" | ");
}

function getMetricBoxTotalWidth(plans) {
    if (plans.length === 0) {
        return "";
    }

    return plans[plans.length - 1].geometricBounds[3] - plans[0].geometricBounds[1];
}

function getClampedMetricBoxStartX(startX, totalWidth, pageBounds) {
    var x = Number(startX);
    var width = Number(totalWidth);
    var left;
    var right;

    if (isNaN(x) || isNaN(width) || !pageBounds) {
        return x;
    }

    left = Number(pageBounds.left);
    right = Number(pageBounds.right);

    if (isNaN(left) || isNaN(right) || right <= left) {
        return x;
    }

    if (width >= right - left) {
        return left;
    }

    if (x < left) {
        return left;
    }

    if (x + width > right) {
        return right - width;
    }

    return x;
}

function getCenteredMetricBoxStartX(itemCodeStartX, itemCodeEndX, record, pageBounds) {
    var startX = Number(itemCodeStartX);
    var endX = Number(itemCodeEndX);
    var centeredPlans;
    var totalWidth;
    var centeredX;

    if (isNaN(startX)) {
        return "";
    }

    if (isNaN(endX) || endX <= startX) {
        return startX;
    }

    centeredPlans = buildMetricBoxPlans({ x: 0, y: 0 }, record);
    totalWidth = getMetricBoxTotalWidth(centeredPlans);

    if (totalWidth === "" || isNaN(Number(totalWidth))) {
        return startX;
    }

    centeredX = ((startX + endX) / 2) - (Number(totalWidth) / 2);

    return getClampedMetricBoxStartX(centeredX, Number(totalWidth), pageBounds);
}

function escapeItemMetricCsv(value) {
    var source = String(value === undefined || value === null ? "" : value);
    return "\"" + source.replace(/"/g, "\"\"") + "\"";
}

function itemMetricCsvLine(values) {
    var escaped = [];
    var i;

    for (i = 0; i < values.length; i++) {
        escaped.push(escapeItemMetricCsv(values[i]));
    }

    return escaped.join(",");
}

function makeItemMetricTimestamp(date) {
    return [
        date.getFullYear(),
        padMetricNumber(date.getMonth() + 1, 2),
        padMetricNumber(date.getDate(), 2)
    ].join("-") + "_" + [
        padMetricNumber(date.getHours(), 2),
        padMetricNumber(date.getMinutes(), 2),
        padMetricNumber(date.getSeconds(), 2)
    ].join("-");
}

function getItemMetricReportFolder(doc) {
    try {
        if (doc.saved && doc.filePath) {
            return doc.filePath;
        }
    } catch (error) {
        // Fall through to desktop.
    }

    return Folder.desktop;
}

function readItemMetricTextFile(file) {
    file.encoding = "UTF-8";
    file.open("r");
    var text = file.read();
    file.close();
    return text;
}

function getStoryFirstTextContainerForItemMetric(story) {
    try {
        if (story.textContainers && story.textContainers.length > 0) {
            return story.textContainers[0];
        }
    } catch (error) {
        return null;
    }

    return null;
}

function getStoryPageNameForItemMetric(story) {
    var container = getStoryFirstTextContainerForItemMetric(story);

    try {
        if (container && container.parentPage) {
            return container.parentPage.name;
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getStoryTextFrameNameForItemMetric(story) {
    var container = getStoryFirstTextContainerForItemMetric(story);

    try {
        if (container) {
            return container.name || "";
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getStoryLayerNameForItemMetric(story) {
    var container = getStoryFirstTextContainerForItemMetric(story);

    try {
        if (container && container.itemLayer) {
            return container.itemLayer.name;
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getItemMetricPageForCharacter(story, characterIndex) {
    try {
        var character = story.characters.item(characterIndex);

        if (character.parentTextFrames && character.parentTextFrames.length > 0 && character.parentTextFrames[0].parentPage) {
            return character.parentTextFrames[0].parentPage;
        }
    } catch (error) {
        // Fall back below.
    }

    try {
        var container = getStoryFirstTextContainerForItemMetric(story);

        if (container && container.parentPage) {
            return container.parentPage;
        }
    } catch (fallbackError) {
        return null;
    }

    return null;
}

function getItemMetricPageHorizontalBounds(pageRef) {
    try {
        var bounds = pageRef.bounds;
        var left = Number(bounds[1]) + ITEM_METRIC_BOX_PAGE_EDGE_PADDING_PT;
        var right = Number(bounds[3]) - ITEM_METRIC_BOX_PAGE_EDGE_PADDING_PT;

        if (!isNaN(left) && !isNaN(right) && right > left) {
            return {
                left: left,
                right: right
            };
        }
    } catch (error) {
        // Fall through to no page clamp.
    }

    return null;
}

function getItemMetricAnchorForMatch(story, match) {
    try {
        var character = story.characters.item(match.start);
        var lastCharacter = story.characters.item(match.end - 1);
        var baseline = Number(character.baseline);
        var x = Number(character.horizontalOffset);
        var endX = Number(lastCharacter.endHorizontalOffset);
        var pageRef = getItemMetricPageForCharacter(story, match.start);

        if (!isNaN(baseline) && !isNaN(x)) {
            return {
                x: x,
                itemCodeStartX: x,
                itemCodeEndX: endX,
                y: baseline + ITEM_METRIC_BOX_OFFSET_BELOW_ITEM_PT,
                pageRef: pageRef,
                pageBounds: getItemMetricPageHorizontalBounds(pageRef)
            };
        }
    } catch (error) {
        // Fall through to no anchor.
    }

    return {
        x: "",
        itemCodeStartX: "",
        itemCodeEndX: "",
        y: "",
        pageRef: null,
        pageBounds: null
    };
}

function collectItemMetricRowsFromDocument(doc, metricData) {
    var rows = [];
    var storyIndex;

    for (storyIndex = 0; storyIndex < doc.stories.length; storyIndex++) {
        var story = doc.stories[storyIndex];
        var matches = extractMetricItemNumbersFromText(story.contents);
        var matchIndex;

        for (matchIndex = 0; matchIndex < matches.length; matchIndex++) {
            var anchor = getItemMetricAnchorForMatch(story, matches[matchIndex]);
            var context = {
                page: getStoryPageNameForItemMetric(story),
                textFrame: getStoryTextFrameNameForItemMetric(story),
                layer: getStoryLayerNameForItemMetric(story),
                storyIndex: storyIndex + 1,
                rawText: story.contents,
                story: story,
                anchorX: anchor.x,
                anchorY: anchor.y,
                pageRef: anchor.pageRef
            };
            var row = buildItemMetricRowsForText(matches[matchIndex].raw, metricData, context)[0];

            row.itemNumber = matches[matchIndex].itemNumber;
            row.itemStart = matches[matchIndex].start;
            row.itemEnd = matches[matchIndex].end;
            row.rawText = story.contents;

            if (!anchor.pageRef || anchor.x === "" || anchor.y === "") {
                if (row.status === "OK") {
                    row.status = "ANCHOR_NOT_FOUND";
                    row.notes = "Could not calculate item number page coordinates";
                } else {
                    row.notes = row.notes + "; Could not calculate item number page coordinates";
                }
            } else if (row.status === "OK") {
                row.anchorX = getCenteredMetricBoxStartX(anchor.itemCodeStartX, anchor.itemCodeEndX, row.metricRecord, anchor.pageBounds);

                var plans = buildMetricBoxPlans({ x: Number(row.anchorX), y: Number(row.anchorY) }, row.metricRecord);
                row.boxHeightPt = ITEM_METRIC_BOX_HEIGHT_PT;
                row.boxTotalWidthPt = getMetricBoxTotalWidth(plans);
                row.proposedBoxBounds = summarizeMetricBoxPlanBounds(plans);
            }

            rows.push(row);
        }
    }

    return rows;
}

function writeItemMetricDryRunReport(rows, metricData, reportFile) {
    var lines = [
        itemMetricCsvLine([
            "Status",
            "Page",
            "Text Frame",
            "Layer",
            "Item Number",
            "Item Root",
            "Last365DaysSales",
            "UnitsLast365",
            "CountOnHand",
            "ItemAvgWeight",
            "Anchor X",
            "Anchor Y",
            "Box Height Pt",
            "Box Total Width Pt",
            "Proposed Box Bounds",
            "Notes",
            "Raw Text"
        ])
    ];
    var i;

    for (i = 0; i < rows.length; i++) {
        lines.push(itemMetricCsvLine([
            rows[i].status,
            rows[i].page,
            rows[i].textFrame,
            rows[i].layer,
            rows[i].itemNumber,
            rows[i].itemRoot,
            rows[i].last365DaysSales,
            rows[i].unitsLast365,
            rows[i].countOnHand,
            rows[i].itemAvgWeight,
            rows[i].anchorX,
            rows[i].anchorY,
            rows[i].boxHeightPt,
            rows[i].boxTotalWidthPt,
            rows[i].proposedBoxBounds,
            rows[i].notes,
            rows[i].rawText
        ]));
    }

    for (i = 0; i < metricData.errors.length; i++) {
        lines.push(itemMetricCsvLine(["METRIC_DATA_ERROR", "", "", "", "", "", "", "", "", "", "", "", "", "", "", metricData.errors[i], ""]));
    }

    for (i = 0; i < metricData.duplicates.length; i++) {
        lines.push(itemMetricCsvLine(["DUPLICATE_ITEM_ROOT", "", "", "", "", metricData.duplicates[i], "", "", "", "", "", "", "", "", "", "Duplicate rows with identical values are ignored; conflicting values are reported as errors.", ""]));
    }

    for (i = 0; i < metricData.blankRows.length; i++) {
        lines.push(itemMetricCsvLine(["BLANK_ROW", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Ignored blank metric data row " + metricData.blankRows[i], ""]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function writeItemMetricApplyReport(rows, reportFile) {
    var lines = [
        itemMetricCsvLine([
            "Apply Status",
            "Dry Run Status",
            "Page",
            "Text Frame",
            "Layer",
            "Item Number",
            "Item Root",
            "Last365DaysSales",
            "UnitsLast365",
            "CountOnHand",
            "ItemAvgWeight",
            "Anchor X",
            "Anchor Y",
            "Box Height Pt",
            "Box Total Width Pt",
            "Proposed Box Bounds",
            "Notes",
            "Raw Text"
        ])
    ];
    var i;

    for (i = 0; i < rows.length; i++) {
        lines.push(itemMetricCsvLine([
            rows[i].applyStatus,
            rows[i].status,
            rows[i].page,
            rows[i].textFrame,
            rows[i].layer,
            rows[i].itemNumber,
            rows[i].itemRoot,
            rows[i].last365DaysSales,
            rows[i].unitsLast365,
            rows[i].countOnHand,
            rows[i].itemAvgWeight,
            rows[i].anchorX,
            rows[i].anchorY,
            rows[i].boxHeightPt,
            rows[i].boxTotalWidthPt,
            rows[i].proposedBoxBounds,
            rows[i].notes,
            rows[i].rawText
        ]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function countItemMetricRowsByStatus(rows, statusField, status) {
    var count = 0;
    var i;

    for (i = 0; i < rows.length; i++) {
        if (rows[i][statusField] === status) {
            count++;
        }
    }

    return count;
}

function getOrCreateItemMetricLayer(doc) {
    var layer;

    try {
        layer = doc.layers.itemByName(ITEM_METRIC_BOX_LAYER_NAME);
        if (layer && layer.isValid) {
            return layer;
        }
    } catch (error) {
        // Create below.
    }

    layer = doc.layers.add({ name: ITEM_METRIC_BOX_LAYER_NAME });
    return layer;
}

function getOrCreateItemMetricSwatch(doc, name, rgb) {
    var color;

    try {
        color = doc.colors.itemByName(name);
        if (color && color.isValid) {
            return color;
        }
    } catch (error) {
        // Create below.
    }

    color = doc.colors.add();
    color.name = name;
    color.model = ColorModel.PROCESS;
    color.space = ColorSpace.RGB;
    color.colorValue = rgb;
    return color;
}

function getItemMetricPaperSwatch(doc) {
    try {
        return doc.swatches.itemByName("Paper");
    } catch (error) {
        return null;
    }
}

function getItemMetricNoneSwatch(doc) {
    try {
        return doc.swatches.itemByName("None");
    } catch (error) {
        return null;
    }
}

function isGeneratedItemMetricBox(pageItem) {
    try {
        if (String(pageItem.label || "").indexOf(ITEM_METRIC_BOX_LABEL_PREFIX) === 0) {
            return true;
        }
    } catch (labelError) {
        // Check the layer below.
    }

    try {
        return pageItem.itemLayer && pageItem.itemLayer.name === ITEM_METRIC_BOX_LAYER_NAME;
    } catch (layerError) {
        return false;
    }
}

function removeExistingItemMetricBoxes(doc) {
    var removed = 0;
    var i;

    for (i = doc.pageItems.length - 1; i >= 0; i--) {
        try {
            if (isGeneratedItemMetricBox(doc.pageItems[i])) {
                doc.pageItems[i].remove();
                removed++;
            }
        } catch (error) {
            // Keep scanning other page items.
        }
    }

    return removed;
}

function getItemMetricTextSwatches(doc, plan) {
    var swatches = [];
    var i;

    if (!plan.textSwatchNames || !plan.textRgbValues) {
        return swatches;
    }

    for (i = 0; i < plan.textSwatchNames.length; i++) {
        swatches.push(getOrCreateItemMetricSwatch(doc, plan.textSwatchNames[i], plan.textRgbValues[i]));
    }

    return swatches;
}

function applyItemMetricBoldStyle(textObject) {
    try {
        textObject.fontStyle = ITEM_METRIC_BOX_FONT_STYLE;
    } catch (error) {
        // Some fonts do not expose a Bold face. Keep the rest of the styling.
    }
}

function styleItemMetricTextFrame(textFrame, lineTextColors) {
    var centerJustification = null;

    try {
        if (typeof Justification !== "undefined") {
            centerJustification = Justification.CENTER_ALIGN;
        }
    } catch (justificationError) {
        centerJustification = null;
    }

    try {
        textFrame.textFramePreferences.insetSpacing = [0, 0, 0, 0];
        textFrame.textFramePreferences.verticalJustification = VerticalJustification.TOP_ALIGN;
    } catch (error) {
        // Keep formatting best-effort.
    }

    try {
        textFrame.texts[0].pointSize = ITEM_METRIC_BOX_FONT_SIZE_PT;
        textFrame.texts[0].leading = ITEM_METRIC_BOX_LEADING_PT;
        applyItemMetricBoldStyle(textFrame.texts[0]);

        if (centerJustification !== null) {
            textFrame.texts[0].justification = centerJustification;
        }
    } catch (formatError) {
        // Keep formatting best-effort.
    }

    try {
        var i;

        for (i = 0; i < textFrame.paragraphs.length; i++) {
            textFrame.paragraphs[i].pointSize = ITEM_METRIC_BOX_FONT_SIZE_PT;
            textFrame.paragraphs[i].leading = ITEM_METRIC_BOX_LEADING_PT;

            if (centerJustification !== null) {
                textFrame.paragraphs[i].justification = centerJustification;
            }

            if (lineTextColors && lineTextColors[i]) {
                textFrame.paragraphs[i].fillColor = lineTextColors[i];
            }

            applyItemMetricBoldStyle(textFrame.paragraphs[i]);
        }
    } catch (paragraphError) {
        // Keep formatting best-effort.
    }
}

function createMetricBox(pageRef, layer, plan, itemRoot, itemNumber, textColor, doc) {
    var textFrame = pageRef.textFrames.add();
    var lineTextColors = getItemMetricTextSwatches(doc, plan);

    textFrame.itemLayer = layer;
    textFrame.geometricBounds = plan.geometricBounds;
    textFrame.contents = plan.text;
    textFrame.fillColor = getOrCreateItemMetricSwatch(doc, plan.fillSwatchName, plan.rgb);
    textFrame.strokeWeight = 0;

    var noneSwatch = getItemMetricNoneSwatch(doc);

    if (noneSwatch) {
        textFrame.strokeColor = noneSwatch;
    }

    textFrame.label = ITEM_METRIC_BOX_LABEL_PREFIX + "|" + itemRoot + "|" + itemNumber + "|" + plan.kind;
    styleItemMetricTextFrame(textFrame, lineTextColors);
    return textFrame;
}

function getItemMetricApplyDecision(status, appliedOkCount, maxRows) {
    var limit = Number(maxRows || 0);

    if (status !== "OK") {
        return "SKIPPED_" + status;
    }

    if (!isNaN(limit) && limit > 0 && appliedOkCount >= limit) {
        return "SKIPPED_LIMIT";
    }

    return "APPLY";
}

function getItemMetricApplyDoScriptSource(maxRows) {
    var limit = Number(maxRows || 0);

    if (isNaN(limit) || limit < 0) {
        limit = 0;
    }

    return "ITEM_METRIC_BOX_RESULT = withItemMetricPointUnits(function () { return applyItemMetricBoxesToRows(app.activeDocument, ITEM_METRIC_BOX_PENDING_ROWS, " + limit + "); });";
}

function applyItemMetricBoxesToRows(doc, rows, maxRows) {
    var layer = getOrCreateItemMetricLayer(doc);
    var textColor = getItemMetricPaperSwatch(doc);
    var createdBoxes = 0;
    var skippedRows = 0;
    var errorRows = 0;
    var removedBoxes = removeExistingItemMetricBoxes(doc);
    var appliedOkCount = 0;
    var i;

    for (i = 0; i < rows.length; i++) {
        var applyDecision = getItemMetricApplyDecision(rows[i].status, appliedOkCount, maxRows);

        if (applyDecision !== "APPLY") {
            rows[i].applyStatus = applyDecision;
            skippedRows++;
            continue;
        }

        try {
            var plans = buildMetricBoxPlans({ x: Number(rows[i].anchorX), y: Number(rows[i].anchorY) }, rows[i].metricRecord);
            var planIndex;

            for (planIndex = 0; planIndex < plans.length; planIndex++) {
                createMetricBox(rows[i].pageRef, layer, plans[planIndex], rows[i].itemRoot, rows[i].itemNumber, textColor, doc);
                createdBoxes++;
            }

            rows[i].applyStatus = "CREATED";
            appliedOkCount++;
        } catch (error) {
            rows[i].applyStatus = "ERROR";
            rows[i].notes = error.message;
            errorRows++;
        }
    }

    return {
        createdBoxes: createdBoxes,
        skippedRows: skippedRows,
        errorRows: errorRows,
        removedBoxes: removedBoxes,
        appliedRows: appliedOkCount
    };
}

function getItemMetricScriptFolder() {
    try {
        return File($.fileName).parent;
    } catch (error) {
        return Folder.current;
    }
}

function loadItemMetricDataFromScriptFolder() {
    var scriptFolder = getItemMetricScriptFolder();
    var dataFile = File(scriptFolder + "/item_metrics.csv");

    if (!dataFile.exists) {
        return {
            file: dataFile,
            metricData: null,
            error: "Could not find item_metrics.csv next to this script: " + dataFile.fsName
        };
    }

    return {
        file: dataFile,
        metricData: parseItemMetricCsv(readItemMetricTextFile(dataFile)),
        error: ""
    };
}

function dryRunItemMetricBoxesMain() {
    if (app.documents.length === 0) {
        alert("Open an InDesign document before running this script.");
        return;
    }

    var dataLoad = loadItemMetricDataFromScriptFolder();

    if (dataLoad.error) {
        alert(dataLoad.error);
        return;
    }

    var doc = app.activeDocument;
    var rows = withItemMetricPointUnits(function () {
        return collectItemMetricRowsFromDocument(doc, dataLoad.metricData);
    });
    var reportFolder = getItemMetricReportFolder(doc);
    var timestamp = makeItemMetricTimestamp(new Date());
    var reportFile = File(reportFolder + "/Item Metric Boxes Dry Run " + timestamp + ".csv");

    writeItemMetricDryRunReport(rows, dataLoad.metricData, reportFile);

    alert(
        "Item metric boxes dry run complete.\r\r" +
        "Item numbers: " + rows.length + "\r" +
        "OK: " + countItemMetricRowsByStatus(rows, "status", "OK") + "\r" +
        "Missing metric data: " + countItemMetricRowsByStatus(rows, "status", "MISSING_METRIC_DATA") + "\r" +
        "Anchor not found: " + countItemMetricRowsByStatus(rows, "status", "ANCHOR_NOT_FOUND") + "\r" +
        "Metric data errors: " + dataLoad.metricData.errors.length + "\r\r" +
        "Dry run:\r" + reportFile.fsName
    );
}

function applyItemMetricBoxesMain(maxRows) {
    if (app.documents.length === 0) {
        alert("Open an InDesign document before running this script.");
        return;
    }

    var dataLoad = loadItemMetricDataFromScriptFolder();

    if (dataLoad.error) {
        alert(dataLoad.error);
        return;
    }

    if (dataLoad.metricData.errors.length > 0) {
        alert("Metric data has " + dataLoad.metricData.errors.length + " error(s). No boxes were created. Run the dry run and review the report first.");
        return;
    }

    var doc = app.activeDocument;
    var rows = withItemMetricPointUnits(function () {
        return collectItemMetricRowsFromDocument(doc, dataLoad.metricData);
    });
    var okRows = countItemMetricRowsByStatus(rows, "status", "OK");
    var applyLimit = Number(maxRows !== undefined ? maxRows : ITEM_METRIC_BOX_APPLY_LIMIT || 0);
    var rowsToApply;
    var reportFolder = getItemMetricReportFolder(doc);
    var timestamp = makeItemMetricTimestamp(new Date());
    var reportFile = File(reportFolder + "/Item Metric Boxes Apply " + timestamp + ".csv");
    var result;

    if (isNaN(applyLimit) || applyLimit < 0) {
        applyLimit = 0;
    }

    rowsToApply = applyLimit > 0 && okRows > applyLimit ? applyLimit : okRows;

    if (okRows === 0) {
        writeItemMetricApplyReport(rows, reportFile);
        alert("No metric boxes were created because no item numbers had usable metric data.\r\rApply report:\r" + reportFile.fsName);
        return;
    }

    if (!confirm(
        "Apply item metric boxes?\r\r" +
        "Item numbers with metrics: " + okRows + "\r" +
        (applyLimit > 0 ? "Apply limit: first " + rowsToApply + " OK rows\r" : "") +
        "Boxes to create: " + (rowsToApply * ITEM_METRIC_BOXES_PER_ITEM) + "\r" +
        "Missing metric data: " + countItemMetricRowsByStatus(rows, "status", "MISSING_METRIC_DATA") + "\r\r" +
        "Existing generated metric boxes will be removed and recreated."
    )) {
        return;
    }

    if (typeof app.doScript === "function" && typeof ScriptLanguage !== "undefined" && typeof UndoModes !== "undefined") {
        ITEM_METRIC_BOX_PENDING_ROWS = rows;
        ITEM_METRIC_BOX_RESULT = null;

        try {
            app.doScript(
                getItemMetricApplyDoScriptSource(applyLimit),
                ScriptLanguage.JAVASCRIPT,
                undefined,
                UndoModes.ENTIRE_SCRIPT,
                "Apply Item Metric Boxes"
            );
            result = ITEM_METRIC_BOX_RESULT;
        } finally {
            ITEM_METRIC_BOX_PENDING_ROWS = null;
            ITEM_METRIC_BOX_RESULT = null;
        }
    } else {
        result = withItemMetricPointUnits(function () {
            return applyItemMetricBoxesToRows(doc, rows, applyLimit);
        });
    }

    writeItemMetricApplyReport(rows, reportFile);

    alert(
        "Item metric boxes apply complete.\r\r" +
        "Removed old boxes: " + result.removedBoxes + "\r" +
        "Applied item rows: " + result.appliedRows + "\r" +
        "Created boxes: " + result.createdBoxes + "\r" +
        "Skipped rows: " + result.skippedRows + "\r" +
        "Errors: " + result.errorRows + "\r\r" +
        "Apply report:\r" + reportFile.fsName
    );
}

if (typeof app !== "undefined" && typeof ITEM_METRIC_BOX_SKIP_MAIN === "undefined") {
    dryRunItemMetricBoxesMain();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        applyItemMetricBoxesToRows: applyItemMetricBoxesToRows,
        buildItemMetricRowsForText: buildItemMetricRowsForText,
        buildMetricBoxPlans: buildMetricBoxPlans,
        extractMetricItemNumbersFromText: extractMetricItemNumbersFromText,
        formatMetricValue: formatMetricValue,
        getCenteredMetricBoxStartX: getCenteredMetricBoxStartX,
        getClampedMetricBoxStartX: getClampedMetricBoxStartX,
        getItemMetricApplyDoScriptSource: getItemMetricApplyDoScriptSource,
        getItemMetricApplyDecision: getItemMetricApplyDecision,
        isGeneratedItemMetricBox: isGeneratedItemMetricBox,
        normalizeItemRoot: normalizeItemRoot,
        parseItemMetricCsv: parseItemMetricCsv
    };
}
