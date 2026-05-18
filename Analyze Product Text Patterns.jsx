/*
Analyze Product Text Patterns.jsx

Scans full text-frame contents in the active InDesign document, replaces
variable product text with placeholders, groups repeated layouts, and writes
CSV reports. This script does not modify the document.
*/

function normalizeLineEndings(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function padNumber(value, width) {
    var output = String(value);

    while (output.length < width) {
        output = "0" + output;
    }

    return output;
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

function getTokenizedText(text, tokens) {
    var output = "";
    var lastIndex = 0;
    var priceNumber = 0;
    var sizeNumber = 0;
    var i;

    for (i = 0; i < tokens.length; i++) {
        output += text.substring(lastIndex, tokens[i].start);

        if (tokens[i].type === "PRICE") {
            priceNumber++;
            output += "<PRICE_" + priceNumber + ">";
        } else if (tokens[i].type === "SIZE") {
            sizeNumber++;
            output += "<SIZE_" + sizeNumber + ">";
        } else {
            output += "<ITEM_NUMBER>";
        }

        lastIndex = tokens[i].end;
    }

    output += text.substring(lastIndex);
    return output;
}

function isLikelyGiftLine(line) {
    var text = line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    var upper = text.toUpperCase();

    if (text === "") {
        return false;
    }

    if (line.indexOf("<PRICE_") !== -1 || line.indexOf("<ITEM_NUMBER>") !== -1) {
        return /REGALO|GIFT|FREE|BONUS|GRATIS|INCLUDES?|INCLUIDO/.test(upper);
    }

    return /REGALO|GIFT|FREE|BONUS|GRATIS|INCLUDES?|INCLUIDO/.test(upper);
}

function extractGiftKeywordText(line) {
    var matches = [];
    var pattern = /\b(REGALO(?:\s+[A-D])?|GIFT|FREE|BONUS|GRATIS|INCLUIDO)\b/ig;
    var match;

    while ((match = pattern.exec(line)) !== null) {
        matches.push(match[0].replace(/\s+/g, " "));
    }

    return matches.join(" ");
}

function findGiftCandidate(tokenizedText) {
    var lines = tokenizedText.split("\n");
    var candidates = [];
    var i;

    for (i = 0; i < lines.length; i++) {
        var line = lines[i].replace(/\t/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");

        if (isLikelyGiftLine(line)) {
            if (line.indexOf("<PRICE_") !== -1 || line.indexOf("<ITEM_NUMBER>") !== -1) {
                var giftKeywordText = extractGiftKeywordText(line);

                if (giftKeywordText) {
                    candidates.push(giftKeywordText);
                }
            } else {
                candidates.push(line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""));
            }
        }
    }

    return candidates.join(" | ");
}

function replaceLiteral(source, searchValue, replacement) {
    if (!searchValue) {
        return source;
    }

    return source.split(searchValue).join(replacement);
}

function normalizeStaticText(text, giftCandidate) {
    var normalized = String(text || "");

    if (giftCandidate && giftCandidate.indexOf(" | ") === -1) {
        normalized = replaceLiteral(normalized, giftCandidate, "<GIFT_TEXT>");
    }

    normalized = normalized
        .replace(/\n/g, "<LINE_BREAK>")
        .replace(/\t/g, "<TAB>")
        .replace(/[ ]+/g, " ");

    return normalized;
}

function buildNormalizedPattern(text, tokens, giftCandidate) {
    var output = "";
    var lastIndex = 0;
    var priceNumber = 0;
    var sizeNumber = 0;
    var i;

    for (i = 0; i < tokens.length; i++) {
        output += normalizeStaticText(text.substring(lastIndex, tokens[i].start), giftCandidate);

        if (tokens[i].type === "PRICE") {
            priceNumber++;
            output += "<PRICE_" + priceNumber + ">";
        } else if (tokens[i].type === "SIZE") {
            sizeNumber++;
            output += "<SIZE_" + sizeNumber + ">";
        } else {
            output += "<ITEM_NUMBER>";
        }

        lastIndex = tokens[i].end;
    }

    output += normalizeStaticText(text.substring(lastIndex), giftCandidate);
    return output.replace(/^\s+|\s+$/g, "");
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
    var tokenizedText;
    var giftCandidate;
    var normalizedPattern;
    var notes = [];
    var i;

    sortTokens(tokens);
    tokenizedText = getTokenizedText(source, tokens);
    giftCandidate = findGiftCandidate(tokenizedText);
    normalizedPattern = buildNormalizedPattern(source, tokens, giftCandidate);

    for (i = 0; i < tokens.length; i++) {
        if (tokens[i].type === "ITEM_NUMBER") {
            itemNumbers.push(tokens[i].value);
        } else if (tokens[i].type === "PRICE") {
            prices.push(tokens[i].value);
        } else if (tokens[i].type === "SIZE") {
            sizes.push(tokens[i].value);
        }
    }

    if (itemNumbers.length !== 1) {
        notes.push("Expected 1 item number; found " + itemNumbers.length);
    }

    if (prices.length !== 2) {
        notes.push("Expected 2 prices; found " + prices.length);
    }

    return {
        rawText: source,
        itemNumbers: itemNumbers,
        prices: prices,
        sizes: sizes,
        giftCandidate: giftCandidate,
        normalizedPattern: normalizedPattern,
        confidence: notes.length === 0 ? "high" : "review",
        notes: notes.join("; ")
    };
}

function groupPatternRows(rows) {
    var groupsByPattern = {};
    var groups = [];
    var i;

    for (i = 0; i < rows.length; i++) {
        var pattern = rows[i].normalizedPattern;

        if (!groupsByPattern[pattern]) {
            groupsByPattern[pattern] = {
                normalizedPattern: pattern,
                count: 0,
                exampleItemNumber: "",
                exampleRawText: "",
                priceCount: rows[i].prices ? rows[i].prices.length : 0,
                sizeCount: rows[i].sizes ? rows[i].sizes.length : 0,
                hasGiftCandidate: rows[i].giftCandidate ? "yes" : "no"
            };
            groups.push(groupsByPattern[pattern]);
        }

        groupsByPattern[pattern].count++;

        if (!groupsByPattern[pattern].exampleItemNumber && rows[i].itemNumbers && rows[i].itemNumbers.length > 0) {
            groupsByPattern[pattern].exampleItemNumber = rows[i].itemNumbers[0];
        }

        if (!groupsByPattern[pattern].exampleRawText) {
            groupsByPattern[pattern].exampleRawText = rows[i].rawText || "";
        }
    }

    groups.sort(function (a, b) {
        if (a.count !== b.count) {
            return b.count - a.count;
        }

        if (a.normalizedPattern < b.normalizedPattern) {
            return -1;
        }

        if (a.normalizedPattern > b.normalizedPattern) {
            return 1;
        }

        return 0;
    });

    for (i = 0; i < groups.length; i++) {
        groups[i].patternId = "P" + padNumber(i + 1, 3);
    }

    return groups;
}

function getPatternIdLookup(groups) {
    var lookup = {};
    var i;

    for (i = 0; i < groups.length; i++) {
        lookup[groups[i].normalizedPattern] = groups[i].patternId;
    }

    return lookup;
}

function joinArray(values, separator) {
    var parts = [];
    var i;

    for (i = 0; i < values.length; i++) {
        parts.push(values[i]);
    }

    return parts.join(separator);
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

function getFrameText(frame) {
    try {
        if (frame.parentStory && frame.parentStory.textContainers.length === 1) {
            return frame.parentStory.contents;
        }
    } catch (error) {
        // Fall through to frame contents.
    }

    return frame.contents;
}

function getFramePageName(frame) {
    try {
        if (frame.parentPage) {
            return frame.parentPage.name;
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getFrameLayerName(frame) {
    try {
        if (frame.itemLayer) {
            return frame.itemLayer.name;
        }
    } catch (error) {
        return "";
    }

    return "";
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

function pushAnalysisRow(rows, rawText, page, textFrame, layer) {
    var analysis = analyzeProductText(rawText);

    if (analysis.itemNumbers.length === 0) {
        return;
    }

    rows.push({
        page: page,
        textFrame: textFrame,
        layer: layer,
        rawText: analysis.rawText,
        itemNumbers: analysis.itemNumbers,
        prices: analysis.prices,
        sizes: analysis.sizes,
        giftCandidate: analysis.giftCandidate,
        normalizedPattern: analysis.normalizedPattern,
        confidence: analysis.confidence,
        notes: analysis.notes
    });
}

function collectPatternRowsFromDocument(doc) {
    var rows = [];
    var i;

    if (doc.stories && doc.stories.length > 0) {
        for (i = 0; i < doc.stories.length; i++) {
            var story = doc.stories[i];

            pushAnalysisRow(
                rows,
                story.contents,
                getStoryPageName(story),
                getStoryTextFrameName(story),
                getStoryLayerName(story)
            );
        }

        return rows;
    }

    for (i = 0; i < doc.textFrames.length; i++) {
        var frame = doc.textFrames[i];

        pushAnalysisRow(
            rows,
            getFrameText(frame),
            getFramePageName(frame),
            frame.name || "",
            getFrameLayerName(frame)
        );
    }

    return rows;
}

function writeDetailReport(rows, groups, reportFile) {
    var patternIds = getPatternIdLookup(groups);
    var lines = [
        csvLine([
            "Pattern ID",
            "Primary Item Number",
            "All Item Numbers",
            "Page",
            "Text Frame",
            "Layer",
            "Price Count",
            "Prices",
            "Size Count",
            "Sizes",
            "Gift Candidate",
            "Confidence",
            "Notes",
            "Normalized Pattern",
            "Raw Text"
        ])
    ];
    var i;

    for (i = 0; i < rows.length; i++) {
        lines.push(csvLine([
            patternIds[rows[i].normalizedPattern] || "",
            rows[i].itemNumbers.length > 0 ? rows[i].itemNumbers[0] : "",
            joinArray(rows[i].itemNumbers, " | "),
            rows[i].page,
            rows[i].textFrame,
            rows[i].layer,
            rows[i].prices.length,
            joinArray(rows[i].prices, " | "),
            rows[i].sizes.length,
            joinArray(rows[i].sizes, " | "),
            rows[i].giftCandidate,
            rows[i].confidence,
            rows[i].notes,
            rows[i].normalizedPattern,
            rows[i].rawText
        ]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function writeSummaryReport(groups, reportFile) {
    var lines = [
        csvLine([
            "Pattern ID",
            "Count",
            "Price Count",
            "Size Count",
            "Has Gift Candidate",
            "Example Item Number",
            "Normalized Pattern",
            "Example Raw Text"
        ])
    ];
    var i;

    for (i = 0; i < groups.length; i++) {
        lines.push(csvLine([
            groups[i].patternId,
            groups[i].count,
            groups[i].priceCount,
            groups[i].sizeCount,
            groups[i].hasGiftCandidate,
            groups[i].exampleItemNumber,
            groups[i].normalizedPattern,
            groups[i].exampleRawText
        ]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function main() {
    if (app.documents.length === 0) {
        alert("Open an InDesign document before running this script.");
        return;
    }

    var doc = app.activeDocument;
    var rows = collectPatternRowsFromDocument(doc);

    if (rows.length === 0) {
        alert("No product text was found. The analyzer scanned document stories for item numbers that start with #.");
        return;
    }

    var groups = groupPatternRows(rows);
    var reportFolder = getReportFolder(doc);
    var timestamp = makeTimestamp(new Date());
    var summaryFile = File(reportFolder + "/Product Text Pattern Summary " + timestamp + ".csv");
    var detailFile = File(reportFolder + "/Product Text Pattern Details " + timestamp + ".csv");

    writeSummaryReport(groups, summaryFile);
    writeDetailReport(rows, groups, detailFile);

    alert(
        "Analyzed " + rows.length + " product text frame(s) and found " + groups.length + " pattern group(s).\r\r" +
        "Summary:\r" + summaryFile.fsName + "\r\r" +
        "Details:\r" + detailFile.fsName
    );
}

if (typeof app !== "undefined") {
    main();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        analyzeProductText: analyzeProductText,
        collectPatternRowsFromDocument: collectPatternRowsFromDocument,
        groupPatternRows: groupPatternRows
    };
}
