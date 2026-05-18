/*
Dry Run Product Price Superscripts.jsx

Audits product price character formatting without changing the document.
*/

var PRODUCT_PRICE_SUPERSCRIPT_SKIP_MAIN = true;

(function runProductPriceSuperscriptDryRun() {
    if (typeof File === "undefined" || typeof $ === "undefined") {
        return;
    }

    var coreFile = File(File($.fileName).parent + "/Format Product Price Superscripts.jsx");

    if (!coreFile.exists) {
        alert("Could not find Format Product Price Superscripts.jsx next to this script:\r" + coreFile.fsName);
        return;
    }

    coreFile.encoding = "UTF-8";
    coreFile.open("r");
    var coreSource = coreFile.read();
    coreFile.close();

    eval(coreSource);
    dryRunProductPriceSuperscriptsMain();
})();
