/*
Apply Item Metric Boxes Sample.jsx

Creates compact metric boxes for the first 10 usable item rows only.
Use this before the full apply script when checking placement and sizing.
*/

var ITEM_METRIC_BOX_SKIP_MAIN = true;

(function runItemMetricBoxesSampleApply() {
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
    applyItemMetricBoxesMain(10);
})();
