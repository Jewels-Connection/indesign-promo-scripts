/*
Find All Item Numbers.jsx

Scans the active InDesign document for item numbers that start with "#",
then writes a CSV report next to the document, or to the desktop if the
document has not been saved yet.
*/

function extractItemNumbersFromText(text) {
    var results = [];
    var source = text || "";
    var itemNumberPattern = /(^|[^\w])#\s*([A-Za-z0-9][A-Za-z0-9._\/-]*)/g;
    var match;

    while ((match = itemNumberPattern.exec(source)) !== null) {
        var itemNumber = "#" + match[2];
        var startIndex = match.index + match[1].length;

        results.push({
            itemNumber: itemNumber,
            index: startIndex,
            matchText: match[0].substr(match[1].length)
        });
    }

    return results;
}

function getStoryPageName(story) {
    try {
        if (story.textContainers.length > 0 && story.textContainers[0].parentPage) {
            return story.textContainers[0].parentPage.name;
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getStoryFrameName(story) {
    try {
        if (story.textContainers.length > 0) {
            return story.textContainers[0].name || "";
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getExcerpt(text, index) {
    var source = text || "";
    var start = Math.max(0, index - 35);
    var end = Math.min(source.length, index + 45);
    var excerpt = source.substring(start, end);

    return excerpt.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
}

function escapeCsv(value) {
    var source = String(value === undefined || value === null ? "" : value);
    return "\"" + source.replace(/"/g, "\"\"") + "\"";
}

function makeTimestamp(date) {
    function pad(value) {
        return value < 10 ? "0" + value : String(value);
    }

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-") + "_" + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
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

function writeCsvReport(rows, reportFile) {
    function csvLine(values) {
        var escaped = [];
        var valueIndex;

        for (valueIndex = 0; valueIndex < values.length; valueIndex++) {
            escaped.push(escapeCsv(values[valueIndex]));
        }

        return escaped.join(",");
    }

    var lines = [
        csvLine([
            "Item Number",
            "Page",
            "Story",
            "Text Frame",
            "Index",
            "Excerpt"
        ])
    ];
    var i;

    for (i = 0; i < rows.length; i++) {
        lines.push(csvLine([
            rows[i].itemNumber,
            rows[i].page,
            rows[i].storyNumber,
            rows[i].textFrame,
            rows[i].index,
            rows[i].excerpt
        ]));
    }

    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(lines.join("\r\n"));
    reportFile.close();
}

function collectItemNumbersFromDocument(doc) {
    var rows = [];
    var storyIndex;

    for (storyIndex = 0; storyIndex < doc.stories.length; storyIndex++) {
        var story = doc.stories[storyIndex];
        var storyText = story.contents;
        var matches = extractItemNumbersFromText(storyText);
        var pageName = getStoryPageName(story);
        var frameName = getStoryFrameName(story);
        var matchIndex;

        for (matchIndex = 0; matchIndex < matches.length; matchIndex++) {
            rows.push({
                itemNumber: matches[matchIndex].itemNumber,
                page: pageName,
                storyNumber: storyIndex + 1,
                textFrame: frameName,
                index: matches[matchIndex].index,
                excerpt: getExcerpt(storyText, matches[matchIndex].index)
            });
        }
    }

    return rows;
}

function main() {
    if (app.documents.length === 0) {
        alert("Open an InDesign document before running this script.");
        return;
    }

    var doc = app.activeDocument;
    var rows = collectItemNumbersFromDocument(doc);

    if (rows.length === 0) {
        alert("No item numbers were found. The script looks for # followed by letters or numbers.");
        return;
    }

    var reportFolder = getReportFolder(doc);
    var reportFile = File(reportFolder + "/Item Numbers Report " + makeTimestamp(new Date()) + ".csv");

    writeCsvReport(rows, reportFile);

    alert("Found " + rows.length + " item number(s).\r\rReport saved to:\r" + reportFile.fsName);
}

if (typeof app !== "undefined") {
    main();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        extractItemNumbersFromText: extractItemNumbersFromText
    };
}
