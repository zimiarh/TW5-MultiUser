/*\
title: $:/plugins/OokTech/MultiUser/action-manualpush.js
type: application/javascript
module-type: widget

Action widget to do a manually push

<$action-manualpush>
\*/
(function(){

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";

    var Widget = require("$:/core/modules/widgets/widget.js").widget;
    
    var ManualPushWidget = function(parseTreeNode,options) {
        this.initialise(parseTreeNode,options);
    };
    
    /*
    Inherit from the base widget class
    */
    ManualPushWidget.prototype = new Widget();
    
    /*
    Render this widget into the DOM
    */
    ManualPushWidget.prototype.render = function(parent,nextSibling) {
        this.computeAttributes();
        this.execute();
    };
    
    /*
    Compute the internal state of the widget
    */
    ManualPushWidget.prototype.execute = function() {
        this.actionBaseTitle = this.getAttribute("$basetitle");
        this.actionSaveTitle = this.getAttribute("$savetitle");
        this.actionTimestamp = this.getAttribute("$timestamp","yes") === "yes";
    };
    
    /*
    Refresh the widget by ensuring our attributes are up to date
    */
    ManualPushWidget.prototype.refresh = function(changedTiddlers) {
        var changedAttributes = this.computeAttributes();
        if($tw.utils.count(changedAttributes) > 0) {
            this.refreshSelf();
            return true;
        }
        return this.refreshChildren(changedTiddlers);
    };
    
    /*
    Invoke the action associated with this widget
    */
    ManualPushWidget.prototype.invokeAction = function(triggeringWidget,event) {
        $tw.MultiUser.PushQueuedModifications();
        return true; // Action was invoked
    };
    
    exports["action-manualpush"] = ManualPushWidget;
    
    })();
    