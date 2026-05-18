/*
Apply Item Metric Boxes.jsx

Creates compact metric boxes below item numbers after dry-run review.
*/

var ITEM_METRIC_BOX_SKIP_MAIN = true;

(function runItemMetricBoxesApply() {
    if (typeof File === "undefined" || typeof $ === "undefined") {
        return;
    }

    var coreFile = File(File($.fileName).parent + "/Item Metric Boxes.jsx");

    if (!coreFile.exists) {
        alert("Could not find Item Metric Boxes.jsx next to this script:\r" + coreFile.fsName);
        return;
    }

    coreFile.encoding = "UTF-8";
    coreFile.open("r");
    var coreSource = coreFile.read();
    coreFile.close();

    eval(coreSource);
    applyItemMetricBoxesMain();
})();
