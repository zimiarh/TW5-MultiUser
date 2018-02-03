/*\
title: $:/plugins/OokTech/MultiUser/ModificationQueue.js
type: application/javascript
module-type: startup

This is the client side program which manages the queued modifications
\*/

(function () {

  /*jslint node: true, browser: true */
  /*global $tw: false */
  "use strict";

  // Export name and synchronous status
  exports.name = "modification-queue-setup";
  exports.platforms = ["browser"];
  exports.after = ["render"];
  exports.synchronous = true;

  $tw.MultiUser = $tw.MultiUser || {};
  $tw.MultiUser.QueuedModifications = $tw.MultiUser.QueuedModifications || {};

  $tw.MultiUser.IsQueued = function(tiddlerTitle) {
    if (tiddlerTitle && typeof(tiddlerTitle) === 'string') {
      return tiddlerTitle.startsWith('$:/plugins/felixhayashi/tiddlymap');
    }
    else {
      return false;
    }
  }

  $tw.MultiUser.queuedModificationsChangeCallback = function() {}

  $tw.MultiUser.RegisterQueuedModificationsChangeCallback = function(callback) {
    var original = $tw.MultiUser.queuedModificationsChangeCallback;
    $tw.MultiUser.queuedModificationsChangeCallback = function() {
    original.apply(arguments);
    callback.apply(arguments);
    }
  }
  $tw.MultiUser.RegisterQueuedModificationsChangeCallback(RefreshQueuedModifications);

  $tw.MultiUser.PushQueuedModifications = function() {
    var remained = {}
    Object.keys($tw.MultiUser.QueuedModifications).filter(tiddlerTitle => {
      var change = $tw.MultiUser.QueuedModifications[tiddlerTitle];
      if (change.IsSelected === undefined || change.IsSelected === true) {
        $tw.MultiUser.SendChangeToServer(tiddlerTitle, $tw.MultiUser.QueuedModifications[tiddlerTitle]);
      }
      else {
        remained[tiddlerTitle] = change;
      }
    })

    $tw.MultiUser.QueuedModifications = remained;
    $tw.MultiUser.queuedModificationsChangeCallback();
  }

  $tw.MultiUser.AddModificationToQueue = function (tiddlerTitle, change) {
    if (tiddlerTitle in $tw.MultiUser.QueuedModifications) {
      var IsSelected = $tw.MultiUser.QueuedModifications[tiddlerTitle].IsSelected;
      $tw.MultiUser.QueuedModifications[tiddlerTitle] = change;
      $tw.MultiUser.QueuedModifications[tiddlerTitle].IsSelected = IsSelected;
    }
    else {
      $tw.MultiUser.QueuedModifications[tiddlerTitle] = change;
      $tw.MultiUser.QueuedModifications[tiddlerTitle].IsSelected = true;
    }
    $tw.MultiUser.queuedModificationsChangeCallback();
  }
  
  $tw.MultiUser.ToggleModificationIsSelectedState = function(tiddlerTitle) {
    if (tiddlerTitle in $tw.MultiUser.QueuedModifications) {
        var IsSelected = $tw.MultiUser.QueuedModifications[tiddlerTitle].IsSelected;
        // not using ^= because IsSelected might not be defined.
        $tw.MultiUser.QueuedModifications[tiddlerTitle].IsSelected = IsSelected ? false : true; 
        $tw.MultiUser.queuedModificationsChangeCallback();
    }
    else {
        throw `Try to toggle selected state for ${tiddlerTitle} but cannot find it in queue`;
    }
  }

  const STATE_TIDDLER_NAME = "$:/state/QueuedModifications";    

  /*
  tiddlers are readonly, sot the only way to update them is to create a new one.
  */
  function RefreshQueuedModifications() {
    var tiddler = new $tw.Tiddler({title: STATE_TIDDLER_NAME, text: GetQueuedModifications()});
    $tw.wiki.addTiddler(tiddler);
  }

  function GetQueuedModifications() {
      $tw.MultiUser.QueuedModifications = $tw.MultiUser.QueuedModifications || {};
      var text = "<table><tr><th>Queued Changes</th><th>Selected</th></tr>";
      Object.keys($tw.MultiUser.QueuedModifications)
      .sort()
      .forEach(tiddlerTitle => {
          var IsSelectedText = $tw.MultiUser.QueuedModifications[tiddlerTitle].IsSelected ? "O" : "X";
          text += `<tr><td>${tiddlerTitle}</td><td><\$button>${IsSelectedText}<$action-modificationqueue cmd="toggle" tiddlerTitle=\"${tiddlerTitle}\"/></\$button></td></tr>`;
      })

      text += "</table>";
      return text;
  }


})();