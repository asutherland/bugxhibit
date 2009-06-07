
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

/**
 * Maps a day of the week (ex: "Mon") to the number of days that day is in the
 *  past.  The value is strictly positive even though the time direction is
 *  referencing the past.
 */
var weekdayCompensator = null;
var daysOfWeeks = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

var ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * buglist.cgi has a helpful function called DiffDate that makes things
 *  dates relative.  This is not actually helpful to exhibit, so we need to
 *  un-scramble the data.  There is no way to stop bugzilla from doing that
 *  right now, so this is the way it has to be.
 *
 * @return an ISO 8601 formatted date.  Because exhibit is really much happier
 *  with these.
 */
function unDiffDate(aDate) {
  var now, h, m;

  // less than 18 hours ago, uses time.
  if (aDate[2] == ":") {
    // format is hours:minutes:seconds, all 2 digits
    h = parseInt(aDate.substr(0, 2));
    m = parseInt(aDate.substr(3, 5));
    now = new Date();
    // see below for a brief discourse on how I am lazy about timezones
    // (The correct course of action here is to normalize the hour reported by
    //  the bugzilla server to GMT then compensate for our local time-zone.
    //  The reason I am not doing this is because there's the issue of daylight
    //  savings time.  If this machine is not in the right timezone already,
    //  then my compensation needs to know the state of DST on the west coast,
    //  which is annoying.  etc etc.  The right solution is to get better data
    //  from bugzilla.)
    // if the hour hasn't happened yet, they're talking about yesterday
    if (h > now.getHours())
      now.setTime(now.getTime() - ONE_DAY); // avoid rollover issues
    now.setHours(h);
    now.setMinutes(m);
    console.log(aDate, "to", now);
    return now;
  }

  // in the last 6 days, uses a weekday. "Mon 00:00"
  if (aDate[4] != "-") {
    now = new Date();
    // build a map of weekday names to their relative delta
    // XXX this assumes your concept of the current day matches the bugzilla
    //  server's concept.  This happens to hold true for me, since I am on
    //  the west coast.  Unfortunately, the compensation logic is annoying
    //  and it's a weekend.  Workaround is to move to the west coast.  Your
    //  west coast may vary.  Workaround is to move to north america.
    if (weekdayCompensator == null) {
      weekdayCompensator = {};
      var cwd = now.getDay();
      for (var i = 0; i < 7; i++) {
        weekdayCompensator[daysOfWeeks[cwd]] = i;
        cwd = (cwd + 1) % 7;
      }
    }

    var dowStr = aDate.substr(0, 3);
    h = parseInt(aDate.substr(4, 6));
    m = parseInt(aDate.substr(7, 9));
    // avoid having to deal with rollover issues ourselves
    now.setTime(now.getTime() - weekdayCompensator[dowStr] * ONE_DAY);
    now.setHours(h);
    now.setMinutes(m);
    console.log(aDate, "to", now);
    return now;
  }

  // YYYY-MM-DD is already ISO 8601
  return new Date(parseInt(aDate.substr(0, 4)),
                  parseInt(aDate.substr(5, 7)) - 1,
                  parseInt(aDate.substr(8, 10)));
}

/**
 * Exhibit does not like our Date objects.  It really just expects an ISO 8601
 *  formatted date.  There are ways to get things to pass through, but I'm tired
 *  of digging through exhibit right now and have exceeded my time budget.
 */
function makeDateExhibitFriendly(aDate) {
  var ys = aDate.getFullYear().toString();
  var ms = (aDate.getMonth() + 1).toString();
  var ds = aDate.getDate().toString();
  var r = ys + "-" +
         (ms.length == 1 ? ("0" + ms) : ms) + "-" +
         (ds.length == 1 ? ("0" + ds) : ds);
  console.log("...", aDate, "to", r);
  return r;
}

function bugzillaConverter() {
  var data = {items: [],
              properties: {
                num: {valueType: "number"},
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
    goodBug = {num: key}; // parseInt(key)};
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

    goodBug.changeddate =
      makeDateExhibitFriendly(unDiffDate(goodBug.changeddate));
    goodBug.opendate =
      makeDateExhibitFriendly(unDiffDate(goodBug.opendate));
  }

  return data;
}

var buglistCallbackToCall = null;
function buglistCallback() {
  buglistCallbackToCall();
}

// SimileAjax is messing with us, need a helper function to fight it off
function setSearchTitle(aTitle) {
  document.title = aTitle;
  SimileAjax.History._plainDocumentTitle = aTitle;
}

function bugzillaQuickSearch(aQueryString) {
  var url = "https://bugzilla.mozilla.org/buglist.cgi?quicksearch=";
  url += encodeURI(aQueryString);
  url += "&ctype=js&columnlist=all";

  setSearchTitle("bx:qs:" + aQueryString);

  Exhibit.JSONPImporter.load(url, window.database, setupExhibit,
                             bugzillaConverter, "buglistCallbackToCall");
}

function bugzillaWho(aEmailAddress, aHowLong, aWhatFor) {
  var url = "https://bugzilla.mozilla.org/buglist.cgi?email1=";
  url += encodeURI(aEmailAddress) + "&emailtype1=exact";
  if ($.inArray("assignee", aWhatFor) != -1)
    url += "&emailassigned_to1=1";
  if ($.inArray("reporter", aWhatFor) != -1)
    url += "&emailreporter1=1";
  if ($.inArray("cc", aWhatFor) != -1)
    url += "&emailcc1=1";
  if ($.inArray("commenter", aWhatFor) != -1)
    url += "&emaillongdesc1=1";
  url += "&chfieldfrom=" + encodeURI(aHowLong) + "&chfieldto=Now";
  url += "&query_format=advanced&ctype=js&columnlist=all";

  setSearchTitle("bx::who:" + aEmailAddress + " " + aHowLong);

  Exhibit.JSONPImporter.load(url, window.database, setupExhibit,
                             bugzillaConverter, "buglistCallbackToCall");
}

var defaultTimeInterval = "7d";
function pageLoaded() {
  var params = SimileAjax.parseURLParameters(undefined, {
                                               howrecent: defaultTimeInterval,
                                               why: ["commenter"],
                                             }, {
                                               why: Array
                                             });

  if (params.sortBy)
    $("#tileView")[0].setAttribute("ex:orders", params.sortBy);
  if (params.sortOrder)
    $("#tileView")[0].setAttribute("ex:directions", params.sortOrder);
  if (params.groupBySort)
    $("#tileView")[0].setAttribute("ex:grouped", params.groupBySort);

  window.database = Exhibit.Database.create();

  var timeInterval = params.howrecent;

  if (params.qs)
    bugzillaQuickSearch(params.qs);
  else if (params.who)
    bugzillaWho(params.who, timeInterval, params.why);
  // convenience for who and why:
  else if (params.assignee)
    bugzillaWho(params.assignee, timeInterval, ["assignee"]);
  else if (params.reporter)
    bugzillaWho(params.reporter, timeInterval, ["reporter"]);
  else if (params.cc)
    bugzillaWho(params.cc, timeInterval, ["cc"]);
  else if (params.commenter)
    bugzillaWho(params.commenter, timeInterval, ["commenter"]);
  else
    $("#manualSearch").show();
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
  $(".exhibit-facet-header,.exhibit-flowingFacet-header").click(
    function() {
      $(this).toggleClass("collapsed").next().toggle("fast");
      return false;
    }).toggleClass("collapsed").next().hide();
  $(".exhibit-facet[defaultExpanded=true]," +
    ".exhibit-flowingFacet[defaultExpanded=true]").children()
    .removeClass("collapsed").next().show();
  $(".exhibit-text-facet").show().prev().removeClass("collapsed");
}
