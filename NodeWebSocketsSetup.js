/*\
title: $:/plugins/OokTech/MultiUser/NodeWebSocketsSetup.js
type: application/javascript
module-type: startup

This is the node component of the web sockets. It works with
web-sockets-setup.js and ActionWebSocketMessage.js which set up the browser
side and make the action widget used to send messages to the node process.

To extend this you make a new file that adds functions to the
$tw.nodeMessageHandlers object.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "websocket-server";
exports.platforms = ["node"];
exports.after = ["node-settings"];
exports.synchronous = true;

// require the websockets module if we are running node
var WebSocketServer = $tw.node ? require('$:/plugins/OokTech/MultiUser/WS/ws.js').Server : undefined;
var fs = $tw.node ? require("fs"): undefined;
var http = $tw.node ? require("http") : undefined;

/*
  This sets up the websocket server and attaches it to the $tw object
*/
var setup = function () {
  // initialise the empty $tw.nodeMessageHandlers object. This holds the functions that
  // are used for each message type
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  // Initialise connections array
  $tw.connections = [];
  setupOverheatFuse();

  // We need to get the ip address of the node process so that we can connect
  // to the websocket server from the browser
  // This is the node ip module wrapped in a tiddler so it can be packaged with
  // the plugin.
  var ip = require('$:/plugins/OokTech/MultiUser/ip.js');
  var ipAddress = ip.address();
  $tw.settings = $tw.settings || {};
  $tw.settings['ws-server'] = $tw.settings['ws-server'] || {};
  var ServerPort = Number($tw.settings['ws-server'].port) || 8080;
  var host = $tw.settings['ws-server'].host || '127.0.0.1';

  /*
    Make the tiddler that lists the available wikis and puts it in a data tiddler
  */
  var MakeWikiListTiddler = function () {
    var tiddlerFields = {
      title: '$:/plugins/OokTech/MultiUser/WikiList',
      text: JSON.stringify($tw.settings.wikis, "", 2),
      type: 'application/json'
    };
    $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
  }

  MakeWikiListTiddler();

  /*
    This function ensures that the WS server is made on an available port
  */
  var server;
  function makeWSS () {
    try {
      server = http.createServer(function (request, response) {
        // We don't need anything here, this is just for websockets.
      });
      server.on('error', function (e) {
        if (e.code === 'EADDRINUSE') {
          WSS_SERVER_PORT = WSS_SERVER_PORT + 1;
          makeWSS();
        }
      });
      server.listen(WSS_SERVER_PORT, function (e) {
        if (!e) {
          console.log('Websockets listening on ', WSS_SERVER_PORT);
          finishSetup();
        } else {
          console.log('Port ', WSS_SERVER_PORT, ' in use trying ', WSS_SERVER_PORT + 1);
        }
      });
    } catch (e) {
      WSS_SERVER_PORT += 1;
      makeWSS();
    }
  }
  // Stat trying with the next port from the one used by the http process
  // We want this one to start at the +1 place so that the webserver has a
  // chance to be in the desired port.
  var WSS_SERVER_PORT = Number($tw.settings['ws-server'].port) + 1 || ServerPort + 1;
  // This makes the server and returns the actual port used
  makeWSS();

  function finishSetup () {
    $tw.wss = new WebSocketServer({server: server});
    // Put all the port and host info into a tiddler so the browser can use it
    $tw.wiki.addTiddler(new $tw.Tiddler({title: "$:/ServerIP", text: ipAddress, port: ServerPort, host: host, wss_port: WSS_SERVER_PORT}));

    // Set the onconnection function
    $tw.wss.on('connection', handleConnection);
    

    // I don't know how to set up actually closing a connection, so this doesn't
    // do anything useful yet
    /*.
    $tw.wss.on('close', function(connection) {
      console.log('closed connection ', connection);
    })
    */
  }
}

/*
  This function handles connections to a client.
  It currently only supports one client and if a new client connection is made
  it will replace the current connection.
  This function saves the connection and adds the message handler wrapper to
  the client connection.
  The message handler part is a generic wrapper that checks to see if we have a
  handler function for the message type and if so it passes the message to the
  handler, if not it prints an error to the console.

  connection objects are:
  {
    "active": boolean showing if the connection is active,
    "socket": socketObject,
    "name": the user name for the wiki using this connection
  }
*/
function handleConnection(client) {
  console.log("new connection");
  $tw.connections.push({'socket':client, 'active': true, 'messagesHandled': 0});
  client.on('message', function incoming(event) {
    $tw.allMessagesHandled = ($tw.allMessagesHandled || 0) + 1;

    var self = this;
    // Determine which connection the message came from
    var thisIndex = $tw.connections.findIndex(function(connection) {return connection.socket === self;});
    $tw.connections[thisIndex].messagesHandled = ($tw.connections[thisIndex].messagesHandled || 0) + 1;

    try {
      var eventData = JSON.parse(event);
      // Add the source to the eventData object so it can be used later.
      eventData.source_connection = thisIndex;
      // Make sure we have a handler for the message type
      if (typeof $tw.nodeMessageHandlers[eventData.messageType] === 'function') {
        $tw.nodeMessageHandlers[eventData.messageType](eventData);
      } else {
        console.log('No handler for message of type ', eventData.messageType);
      }
    } catch (e) {
      console.log("WebSocket error, probably closed connection: ", e);
    }
  });
  // Respond to the initial connection with a request for the tiddlers the
  // browser currently has to initialise everything.
  $tw.connections[Object.keys($tw.connections).length-1].index = [Object.keys($tw.connections).length-1];
  $tw.connections[Object.keys($tw.connections).length-1].socket.send(JSON.stringify({type: 'listTiddlers'}), function (err) {
    if (err) {
      console.log(err);
    }
  });

  var tiddlerFields = {title: "$:/state/MultiUser/EditingTiddlers", list: $tw.utils.stringifyList(Object.keys($tw.MultiUser.EditingTiddlers))};
  var message = JSON.stringify({type: 'makeTiddler', fields: tiddlerFields});
  client.send(message, function (err) {
    // Send callback function, only used for error handling at the moment.
    if (err) {
      console.log('Websocket sending error:',err);
    }
  });
}

function setupOverheatFuse() {
  $tw.allMessagesHandled = 0;
  tryCheckIfOverheatedPeriodically();
}

function tryCheckIfOverheatedPeriodically() {
  let overheatSettings = loadOverheatSetting();

  if (!overheatSettings.isEnabled || overheatSettings.isEnabled !== "false") {
    checkIfOverheated();
  }

  scheduleOverheatCheck(parseInt(overheatSettings.interval));
}

function loadOverheatSetting() {
  tryLoadGloabalOverheatSettingIntoLocal();
  return $tw.wiki.getTiddler("$:/WikiSettings/split/overheat").fields;
}

function tryLoadGloabalOverheatSettingIntoLocal() {
  if (!$tw.wiki.tiddlerExists("$:/state/WikiSettings/global_overheat_loaded")) {
    
    let overheatSettings = null;

    if ($tw.wiki.tiddlerExists("$:/WikiSettings")) {
      let wikiSettings = JSON.parse($tw.wiki.getTiddler("$:/WikiSettings").fields.text);
      overheatSettings = wikiSettings['overheat'] || createDefaulOverheatSetting();
  
      overheatSettings['title'] = "$:/WikiSettings/split/overheat";
      
      $tw.wiki.addTiddler(new $tw.Tiddler({title: "$:/state/WikiSettings/global_overheat_loaded"}));
    }
    else {
      overheatSettings = createDefaulOverheatSetting();
    }

    $tw.wiki.addTiddler(new $tw.Tiddler(overheatSettings));
  }
}

function createDefaulOverheatSetting() {
  return {
    interval: "10000",
    isEnabled: "true"
  };
}

function checkIfOverheated() {
  console.log("Check for overheat...");
  let isSpecificConnectionOverheated = false;

  $tw.connections.forEach(connection => {
    let perConnectionMessages = connection.messagesHandled || 0;
    if (perConnectionMessages > 10 * 5) {
      console.log("Close a socket due to connection overheat");
      connection.socket.close(1001, "Socket connection closed because the number of messages transferred exceeds the limit");
      isSpecificConnectionOverheated = true;
    }
    
    connection.messagesHandled = 0;
  });

  if (!isSpecificConnectionOverheated) { // checks if aggregated loading from all connections is overheat only if not a single connection is overheat
    $tw.allMessagesHandled = $tw.allMessagesHandled || 0;
    if ($tw.allMessagesHandled > 10 * 10 * 5) { // max: 10 active connections, over 10 seconds, 5 messages per second
      // Closes all connections
      console.log("Close all sockets due to connection overheat");
      $tw.connections.forEach(connection => {
        connection.close(1009, "Server connection closed because the number of messages transferred exceeds the limit");
      })
    }

    $tw.allMessagesHandled = 0;
  }
}

function scheduleOverheatCheck(interval) {
  setTimeout(tryCheckIfOverheatedPeriodically, interval)
}

// Only act if we are running on node. Otherwise WebSocketServer will be
// undefined.
if (WebSocketServer) {
  setup();
}

})();
