
// this comes from using ctype=csv
var columns = ["priority","changeddate","keywords","assigned_to","qa_contact",
               "bug_severity","opendate","resolution","classification",
               "qa_contact_realname","alias","op_sys","cf_blocking_fennec",
               "assigned_to_realname","reporter","rep_platform",
               "short_short_desc","status_whiteboard","votes","bug_status",
               "version","component","reporter_realname","product",
               "target_milestone","patches"];

/**
 * Split a string, returning only non-empty values.
 *
 * Examples using /[[\]]+/:
 * "" => []
 * "[foo][bar]" => ["foo", "bar"]
 * "[foo bar]" => ["foo bar"]
 */
function splitIgnoreEmpty(bstr, pat) {
  if (!bstr)
    return [];

  var bits = bstr.split(pat);
  var result = [];
  // filter out empty entries
  for (var i = 0; i < bits.length; i++) {
    if (bits[i])
      result.push(bits[i]);
  }
  return result;
}

function bugzillaConverter() {
  var data = {items: [],
              properties: {
                patchCount: {valueType: "number"},
                votes: {valueType: "number"},
                opendate: {valueType: "date"},
                changeddate: {valueType: "date"}
                }
              };
  var items = data.items;
  var rawBug, goodBug, iCol;

  for (var key in bugs) {
    if (parseInt(key) == NaN)
      continue;
    rawBug = bugs[key];
    goodBug = {num: key};
    items.push(goodBug);

    for (iCol = 0; iCol < rawBug.length; iCol++) {
      goodBug[columns[iCol]] = rawBug[iCol];
    }

    goodBug.label = key + ": " + goodBug.short_short_desc;
    goodBug.whiteboard_bits =
      splitIgnoreEmpty(goodBug.status_whiteboard, /[[\]]+/);
    goodBug.keyword_bits = splitIgnoreEmpty(goodBug.keywords);
    goodBug.patchCount = splitIgnoreEmpty(goodBug.patches, ",").length;
    goodBug.resolution = goodBug.resolution || "--";
  }

  return data;
}

var buglistCallbackToCall = null;
function buglistCallback() {
  buglistCallbackToCall();
}

function bugzillaQuickSearch(aQueryString) {
  var url = "https://bugzilla.mozilla.org/buglist.cgi?quicksearch=";
  url += encodeURI(aQueryString);
  url += "&ctype=js&columnlist=all";

  Exhibit.JSONPImporter.load(url, window.database, setupExhibit,
                             bugzillaConverter, "buglistCallbackToCall");
}

function pageLoaded() {
  var params = SimileAjax.parseURLParameters();

  window.database = Exhibit.Database.create();

  if (params.qs)
    bugzillaQuickSearch(params.qs);
  else
    $("#manual").show();
}

function setupExhibit() {
  window.exhibit = Exhibit.create();
  window.exhibit.configureFromDOM();
  exhibitLoaded();
}

/**
 *
 */
function exhibitLoaded() {
  $(".exhibit-facet-header").click(
    function() {
      $(this).toggleClass("collapsed").next().toggle("fast");
      return false;
    }).toggleClass("collapsed").next().hide();
  $(".exhibit-facet[defaultExpanded=true]").children()
    .removeClass("collapsed").next().show();
}
