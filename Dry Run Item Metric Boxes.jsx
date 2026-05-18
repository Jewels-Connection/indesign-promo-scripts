/*
Dry Run Item Metric Boxes.jsx

Audits where compact metric boxes would be placed below item numbers.
*/

var ITEM_METRIC_BOX_SKIP_MAIN = true;

(function runItemMetricBoxesDryRun() {
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
    dryRunItemMetricBoxesMain();
})();
