

/*

This code is issued under a disjunctive tri-license giving you the choice of
one of the three following sets of free software/open source licensing terms:

    * Mozilla Public License, version 1.1
    * GNU General Public License, version 2.0 
    * GNU Lesser General Public License, version 2.1

For users under the Mozilla Public License:

The contents of this file are subject to the Mozilla Public License
Version 1.1 (the "License"); you may not use this file except in
compliance with the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS"
basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the
License for the specific language governing rights and limitations
under the License.

The Original Code is the gmnexpl Gemini addon.

The Initial Developer of the Original Code is Cameron Kaiser.
Portions created by Cameron Kaiser are Copyright (C) 2008
Cameron Kaiser. All Rights Reserved. Copyright (C) 2008 Contributors
to the GmnExpl Project.

For users under the GNU Public License:

gmnexpl Gemini/CSO Firefox addon
Copyright (C) 2008 Cameron Kaiser
Copyright (C) 2008 Contributors to the GmnExpl Project

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; version 2.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
[ or http://www.gnu.org/licenses/gpl-2.0.html ]

For users under the GNU Lesser General Public License:

gmnexpl Gemini/CSO Firefox addon
Copyright (C) 2008 Cameron Kaiser
Copyright (C) 2008 Contributors to the GmnExpl Project

This library is free software; you can redistribute it and/or
modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation; version 2.1.

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public
License along with this library; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
[ or http://www.gnu.org/licenses/lgpl-2.1.html ]

*/
const GMNXVERS = 1.1; 
const GMNXBUILD = 1424;
const GMNXBUILDPREF = "extensions.gmnexpl.buildmark";
const GMNXDOTLESSPREF = "extensions.gmnexpl.dotless";
const GMNXSCHEME = "gemini";
const GMNXCHROMEURL = "chrome://gmnexpl";
const GMNXABOUTURL = (GMNXCHROMEURL + "/content/infobabe.html");
const GMNXIABOUTURL = "about:gmnexpl";
const GMNXRABOUTURL = (GMNXCHROMEURL + "/content/startpage.html");
const GMNXPROT_HANDLER_CONTRACTID = "@mozilla.org/network/protocol;1?name="+GMNXSCHEME;
const GMNXPROT_HANDLER_CID = Components.ID("{977ffc4c-a635-433d-8477-ea575bfb7b19}");

const nsISupports = Components.interfaces.nsISupports;
const nsIRequest = Components.interfaces.nsIRequest;
const nsIChannel = Components.interfaces.nsIChannel;
const nsISocketTransport = Components.interfaces.nsISocketTransport;
const nsIStreamConverter = Components.interfaces.nsIStreamConverter;
const nsIStreamListener = Components.interfaces.nsIStreamListener;
const nsIObserver = Components.interfaces.nsIObserver;
const nsIRequestObserver = Components.interfaces.nsIRequestObserver;
const nsIProtocolHandler = Components.interfaces.nsIProtocolHandler;
const nsIProxiedProtocolHandler = Components.interfaces.nsIProxiedProtocolHandler;
const nsIProgressEventSink = Components.interfaces.nsIProgressEventSink;

const nsIEventQueueService = Components.interfaces.nsIEventQueueService;


/* port control */
// 80 is okay because of some hybrid servers that can speak both on one port
//var badports = [ 20,21,22,23,25,53,69,111,115,137,138,139,443,513,514,548 ];
var alwayslet = [ 1965 ];

var whereami = ''; // for gemini text to html

/* global function for logging to the error console */
function GmnExplLog(msg, error) {

//	return Components.results.NS_OK; // comment out for logging

        var consoleService = Components.
		classes["@mozilla.org/consoleservice;1"]
		.getService(Components.interfaces.nsIConsoleService);
	msg = "gmnexpl says: "+msg;
	if (error) {
		consoleService.logStringError(msg);
	} else {
		consoleService.logStringMessage(msg);
	}
}

/* crap on a stick.
   you mean I have to implement my own NS_QueryNotificationCallbacks?
   so what do I have XPConnect for anyway?!
   rot in hell. */
function GmnExplQNC(one, two, three) {
	var progsink = null;

	if (three)
		return three;
	if (one.notificationCallbacks) {
		progsink = one.notificationCallbacks
			.getInterface(nsIProgressEventSink);
		if (!progsink && two) {
			// try that instead
			var cbs = two.notificationCallbacks;
			if (cbs)
				progsink = cbs.getInterface(
					nsIProgressEventSink);
		}
	}
	return(progsink);
}

// string.trim() polyfill 
if (!String.prototype.trim) {
	String.prototype.trim = function () {
		return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
	};
}
/***   Regex Markdown Parser by chalarangelo   ***/
// Replaces 'regex' with 'replacement' in 'str'
// Curry function, usage: replaceRegex(regexVar, replacementVar) (strVar)
const replaceRegex = function(regex, replacement){
	return function(str){
		return str.replace(regex, replacement);
	}
}
// Regular expressions for gemini text
const codeBlockRegex = /(\n```\s*)([^]+?.*?[^]+?[^]+?)\1/g;
const linkRegex = /\n=\>[ \t]*([^ \t\n]+)[ \t]*([^\n]+)?/g;
const headingRegex = /\n(#+\s*)(.*)/g;
const blockquoteRegex = /\n(&gt;|\>)(.*)/g;
const unorderedListRegex = /(\n\s*(\*)\s.*)+/g;
const paragraphRegex = /\n+(?!<pre>)(?!<h)(?!<ul>)(?!<blockquote)(?!<hr)(?!\t)([^\n]+)\n/g;

// Replacer functions for Markdown
const codeBlockReplacer = function(fullMatch, tagStart, tagContents){
	return '\n<pre>' + tagContents.trim().replace(/\>/g,"&gt;").replace(/\</g,"&lt;").replace(/\`/g,"&#96;").replace(/\*/g,"&#42;").replace(/\~/g,"&#126;").replace(/\n/g,"<br/>") + '</pre>';
}
const linkReplacer = function(fullMatch, tagURL, tagTitle){
	// TODO FIXME ugly hack on using shared global object `whereami`
	return '<a href="' + (tagURL.indexOf(':') == -1 ? (tagURL.substr(0,1) == '/' ? whereami.substr(0,whereami.indexOf('/', 9)) + tagURL : whereami + tagURL) : tagURL) + '">' + (tagTitle?tagTitle:tagURL) + '</a><br/>';
}
const headingReplacer = function(fullMatch, tagStart, tagContents){
	return '\n<h' + tagStart.trim().length + '>' + tagContents + '</h' + tagStart.trim().length + '>';
}
const blockquoteReplacer = function(fullMatch, tagStart, tagContents){
	return '\n<blockquote>' + tagContents + '</blockquote>';
}
const unorderedListReplacer = function(fullMatch){
	var items = '';
	var _array = fullMatch.trim().split('\n');
	for( var _i = 0; _i < _array.length; _i++) { items += '<li>' + _array[_i].substring(2) + '</li>'; }
	return '\n<ul>' + items + '</ul>';
}
const paragraphReplacer = function(fullMatch, tagContents){
	return '<p>' + tagContents + '</p>';
}

// Rules for Markdown parsing (use in order of appearance for best results)
const replaceCodeBlocks = replaceRegex(codeBlockRegex, codeBlockReplacer);
const replaceLinks = replaceRegex(linkRegex, linkReplacer);
const replaceHeadings = replaceRegex(headingRegex, headingReplacer);
const replaceBlockquotes = replaceRegex(blockquoteRegex, blockquoteReplacer);
const replaceUnorderedLists = replaceRegex(unorderedListRegex, unorderedListReplacer);
const replaceParagraphs = replaceRegex(paragraphRegex, paragraphReplacer);

// Replacement rule order function for Markdown
// Do not use as-is, prefer parseMarkdown as seen below
const replaceGeminiText = function(str) {
  return replaceParagraphs(replaceUnorderedLists(
		replaceBlockquotes(
			replaceHeadings(replaceLinks(
				replaceCodeBlocks(str)
      ))
    )
	));
}
// Parser for Markdown (fixes code, adds empty lines around for parsing)
// Usage: parseMarkdown(strVar)
const parseGeminiText = function(str) {
//GmnExplLog(("parseGeminiText str="+str));
	return replaceGeminiText('\n' + str + '\n').trim();
}


// function for redirecting to new location
function GmnExplRedirectToURL(url) {
GmnExplLog(("GmnExplRedirectToURL url="+url));
	// tell browser to redirect
	var wm = Components
		.classes["@mozilla.org/appshell/window-mediator;1"]
		.getService(Components
			.interfaces
			.nsIWindowMediator);
	wm.getMostRecentWindow('navigator:browser')
		.getBrowser().webNavigation.loadURI(
			url, 0, null, null, null);
}

// 
function GmnExplPrompt(prompt, isPassword) {
	var prompter = Components
		.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components
			.interfaces.nsIPromptService);
	// why does prompt need a null object for the
	// checkbox when we aren't using it??
	var chequestub = { value : false };
	var query = { value : '' };
	var rv;
	// we will accept "blank" responses -- could be valid
	if(!isPassword) {
		rv = prompter.prompt(null,
			"Gemini Explorer",
			prompt,
			query, null, chequestub);
	} else {
		rv = prompter.promptPassword(null,
			"Gemini Explorer",
			prompt,
			query, null, chequestub);
	}
	return query.value;
}

function GmnExplDataHandler(request, meta, buf) {
GmnExplLog(("GmnExplDataHandler meta='"+meta+"'"));
	whereami = request.name;

	if (whereami.asciiSpec) { // is this actually an nsIURI? YES!!
		whereami = whereami.asciiSpec;
	}
	if (whereami && whereami.length) {
		if (whereami.indexOf("?") > -1)
			whereami = ((whereami.split("?"))[0]);
	}
	whereami = whereami.substr(0, whereami.lastIndexOf('/')+1);

	// init the channel with data and content type
	var chan = request.QueryInterface(nsIChannel);

	if(meta.match(/^text\/gemini/)) {
		if (chan)
			chan.contentType = "text/html";

		title = buf.match(/^#\s*(.*?)\n/);
		if(title.length) title=""+title[1];

		return '<html><head><base href="'+whereami+'"/>'+(title ? '<title>'+title+'</title>' : '')+'</head><body>'+parseGeminiText(buf.replace(/\</g,"&lt;"))+'</body></html>';
	} else {
		if (chan)
			chan.contentType = meta;
	}

	return buf;
}

function GmnExplListener() { }
GmnExplListener.prototype = {

	// my stuff
	_contentType: null,
	_listener : null,
	_context : null,
	_buf : '',
	_sstream : null,
	_status_end : -1,
	_status_line : null,
	_status_num : 0,
	_status_meta : null,
	_status_num_end : -1,
	// useful internal functions

	// feed the beast (i.e., the listener on the other end)
	_feedBeast : function(request, listener, context, what) {
		// create a new instance each time (instead of reusing one)
		// just to make sure the previous instance has time to finish
		var stringstream = Components
			.classes["@mozilla.org/io/string-input-stream;1"]
			.createInstance(Components
				.interfaces.nsIStringInputStream);
		stringstream.setData(what, what.length);
		listener.onDataAvailable(request, context,
			stringstream, 0, what.length);
	},

	// nsISupports
	QueryInterface : function(iid) {
		if (!iid.equals(nsIStreamConverter)
				&& !iid.equals(nsIStreamListener)
				&& !iid.equals(nsIRequestObserver)
				&& !iid.equals(nsISupports)) 
			throw Components.results.NS_ERROR_NO_INTERFACE;
		else
			return this;
	},

	// nsIRequestObserver
	onStartRequest : function(request, context) {
		// init the channel with data and content type

		/*var chan = request.QueryInterface(nsIChannel);
		if (chan)
			chan.contentType = this._contentType;*/
				// from asyncConvertData
		this._context = context;
		this._buf = '';
		this._listener.onStartRequest(request, context);
	},

	onStopRequest : function(request, context, status) {
GmnExplLog(("GmnExplListener::onStopRequest _buf.length="+this._buf.length));

		var buf;
		var whoami = request.name;

		if (whoami.asciiSpec) { // is this actually an nsIURI? YES!!
			whoami = whoami.asciiSpec;
		}
		if (whoami && whoami.length) {
			if (whoami.indexOf("?") > -1)
				whoami = ((whoami.split("?"))[0]);
		}

		var chan = request.QueryInterface(nsIChannel);
		if (chan)
			chan.contentType = this._contentType;

		// everything is read in _buf, let's process it
		// buf = "<status-code-from-10-to-62><SP><META>\r\n<DATA>"
		//var _status_end = this._buf.indexOf("\r\n");
		if (this._status_end > 0) {
GmnExplLog(("GmnExplListener::onStopRequest _status_line="+this._status_line));
			/* these are done in onDataAvailable
			var _status_line = this._buf.substr(0,_status_end);
			var _status_num, _status_meta, _status_num_end = _status_line.indexOf(" ");*/
			if (this._status_end > 0) {
				/*_status_num = parseInt(_status_line.substr(0,_status_num_end));
				_status_meta = _status_line.substr(_status_num_end);*/
				if (this._status_num < 10 || this._status_num > 99) {
					buf = "Error: Gemini server returned malformed result.";
				} else {
					switch(this._status_num) {
						case 10: // input (plain text)
						case 11: // input (sensitive text)
							var prompt_result = GmnExplPrompt(this._status_meta, (this._status_num == 11));
							GmnExplRedirectToURL(whoami+"?"+encodeURI(prompt_result));
						break;
						case 20: // success (like HTTP 200)
							//if(this._status_meta != "text/gemini") this._contentType = this._status_meta;
							buf = GmnExplDataHandler(request, this._status_meta, this._buf.substr(this._status_end+2)); // stripped CRLF after status line
							// MORE WORK TODO
							//buf = this._buf;
						break;
						case 30: // temporary redirect (like HTTP 302)
						case 31: // perment redirect (like HTTP 301)
							GmnExplLog("URL REDIRECT: "+this._status_meta);
							// reject dangerous URL schemes
							if (this._status_meta.match(/^(javascript|data)\:/i)) {
								buf = "Gemini server wanted to redirect you to address \""+this._status_meta+"\" which is rejected for safety reasons.";
							} else {
								GmnExplRedirectToURL(this._status_meta);
							}
						break;
						default: // other codes handled here
						buf = "Gemini server returned status code "+this._status_num+" ("+this._status_meta+")";
					}
					// MORE WORK TODO
					//buf = this._buf;
				}
			} else {
				buf = "Error: Gemini server returned malformed result.";
			}
		} else {
			// we get malformed result
			// TODO
			buf = "Error: Gemini server returned malformed result.";
		}

		this._feedBeast(request, this._listener,
			this._context, buf);	
		this._buf = '';
		this._listener.onStopRequest(request, this._context, status);
		this._listener = null;
		this._context = null;
		if (this._sstream)
			this._sstream.close();
		this._sstream = null;

		this._status_end = -1;
		this._status_line = null;
		this._status_num = 0;
		this._status_meta = null;
		this._status_num_end = -1;
	},

	// nsIStreamListener
	onDataAvailable : function(request, context, stream, offset, count) {
		var nbuf;

		if (!this._sstream) {
			// create (and cache) our scriptable input stream
			// note: this is NOT BINARY SAFE
			this._sstream = Components
				.classes["@mozilla.org/scriptableinputstream;1"]
				.createInstance(Components
					.interfaces.nsIScriptableInputStream);
			this._sstream.init(stream);
		}
		nbuf = this._sstream.read(count);
GmnExplLog(("GmnExplListener::onDataAvailable offset="+offset));

		if (!offset) {
			// handle content-type early
			this._status_end = nbuf.indexOf("\r\n");
			if (this._status_end > 0) {
				this._status_line = nbuf.substr(0,this._status_end);
GmnExplLog(("GmnExplListener::onDataAvailable _status_line="+this._status_line));
				this._status_num_end = this._status_line.indexOf(" ");
				if (this._status_end > 0) {
					this._status_num = parseInt(this._status_line.substr(0,this._status_num_end));
					this._status_meta = this._status_line.substr(this._status_num_end+1);
					if(this._status_num == 20) {
						// content-type is in meta!
						if(this._status_meta != "text/gemini") {
							this._contentType = this._status_meta;
						} else {
							this._contentType = "text/html";
						}
						// init the channel with data and content type
						var chan = request.QueryInterface(nsIChannel);

						if (chan) {
							chan.contentType = this._contentType;
						}
					}
				}
			}
		}

		/*if (this._buf.length) {
			this._feedBeast(request, this._listener, this._context,
				this._buf);
			this._buf = nbuf;
		}*/
		this._buf += nbuf;
	},

	// nsIStreamConverter
	convert : function(from, to, listener, context) {
		// synchronous conversion will not be supported w/o good reason
		throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
	},
	asyncConvertData : function(from, to, listener, context) {
		// if this were a real translator, we'd uncomment this
//		if (from != ... || to != ...)
//			throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
		this._contentType = to;
		this._listener = listener;
		this._context = context;
	}
}

/*
 * the converter object for turning a gopher directory into HTML. we no
 * longer use HTTP_INDEX because frankly it can't handle all that gopher
 * offers.
*/

function GmnExplDirconv() { }
GmnExplDirconv.prototype = {

	// my stuff
	_listener : null,
	_context : null,
	_buf : '',
	_pbuf : '',
	_sstream : null,

	/* l10n/i18n support and string bundles */

	// for strings that are already Unicode (like our localization)
	_unicodeEntityFix : function(what) {
		// needed to ampersand-encode ALT text and other stuff
		return "&#" + what.charCodeAt(0) + ";";
	},
	_unicodeStringFix : function(what) {
		var q;
		q = what;
		q = q.replace(/([\u0080-\uFFFF])/g, this._unicodeEntityFix);
		return q;
	},

	_bundle : Components.classes["@mozilla.org/intl/stringbundle;1"]
		.getService(Components
			.interfaces.nsIStringBundleService)
		.createBundle(GMNXCHROMEURL + "/locale/itypes.properties"),
	_getL10NString : function(msg, args) {
		var q;

		if (args) 
			return this._unicodeStringFix(
				this._bundle.formatStringFromName(msg, args,
					args.length));
		else
			return this._unicodeStringFix(
				this._bundle.GetStringFromName(msg));
	},

	_itypes :  [ '0', '1', '2', '3', '4', '5', '6',
			'7', '8', '9', 'g', 'I', 's', 'h', ';',
			'p', 'd', 'T' ]  ,

	// useful internal functions

	// feed the beast (i.e., the listener on the other end)
	_feedBeast : function(request, listener, context, what) {
		// create a new instance each time (instead of reusing one)
		// just to make sure the previous instance has time to finish
		var stringstream = Components
			.classes["@mozilla.org/io/string-input-stream;1"]
			.createInstance(Components
				.interfaces.nsIStringInputStream);
		stringstream.setData(what, what.length);
		listener.onDataAvailable(request, context,
			stringstream, 0, what.length);
	},
	// mungers and twisters to convert RFC-1436 cdata into valid SGML
	_dsSpaceFix : function(what) {
		var wout = what;
		wout = wout.replace(/  /g,		"&nbsp;&nbsp;");
		wout = wout.replace(/ \&nbsp;/g,	"&nbsp;&nbsp;");
		wout = wout.replace(/\&nbsp; /g,	"&nbsp;&nbsp;");
		wout = wout.replace(/^ /,		"&nbsp;");
		return wout;
	},
	_entityFix : function(what) {
		var wout = what;
		wout = wout.replace(/\&/g, "&amp;");
		wout = wout.replace(/>/g, "&gt;");
		wout = wout.replace(/</g, "&lt;");
		return wout;
	},
	_URLfromSel : function(host, port, itype, sel) {
		var suburl = GMNXSCHEME + '://' + host
			+ ((port != 1965)?(':'+port): '')
			+ '/' + encodeURI(itype + sel);
		;
		return suburl;
	},

	// nsISupports
	QueryInterface : function(iid) {
		if (!iid.equals(nsIStreamConverter)
				&& !iid.equals(nsIStreamListener)
				&& !iid.equals(nsIRequestObserver)
				&& !iid.equals(nsISupports)) 
			throw Components.results.NS_ERROR_NO_INTERFACE;
		else
			return this;
	},

	// nsIRequestObserver
	onStartRequest : function(request, context) {
		var whoami = request.name;
		var twhoami = '';
		var rootbutt = '';

		if (whoami.asciiSpec) { // is this actually an nsIURI? YES!!
			if (whoami.path != "/" &&
					whoami.path != "" &&
					whoami.path != "1" &&
					whoami.path != "/1" &&
					whoami.path != "/1/") {
				var rooturl = this._URLfromSel(whoami.host,
					((whoami.port && whoami.port > 0)
						? whoami.port : 1965),
					'1', '');
				rootbutt =
'<div id = "buttonarea"><a href = "' + rooturl + '">' +
'<img class = "gicon" src = "gemini:///internal-root.png" '+
'alt="[' + this._getL10NString('backpath') + ']" '+
'title="[' + this._getL10NString('backpath') + ']"></a></div>' +
"\n";
			}
			whoami = whoami.asciiSpec;
		}
		if (whoami && whoami.length) {
			twhoami = ": "+whoami;
			if (whoami.indexOf("?") > -1)
				whoami = ((whoami.split("?"))[0]) + "?...";
			// we don't do this but someone might (and it
			// does make good sense)
			if (whoami.indexOf("%09") > -1)
				whoami = ((whoami.split("%09"))[0]) + "?...";
		}
		if (!whoami)
			whoami = '';
			
		var ibuf = 
'<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"' + "\n" +
' "http://www.w3.org/TR/html4/strict.dtd">' + "\n" +
"<html>\n"+
"<head>\n"+
'<link rel="stylesheet" href = "gemini:///internal-geminichrome.css" ' +
	'type="text/css"/>' + "\n" +
'<link rel="icon" href = "gemini:///internal-favicon.png" '+
	'type="image/png"/>' + "\n" +
"<title>Gemini document" + twhoami + "</title>\n"+
"</head>\n"+
"<body>\n"+
'<div id = "topbar">'+
'<div id = "urlparent">'+
'<div id = "urlarea"><span class = "purl">' + whoami + '</span></div></div>'
	+ "\n" +
rootbutt +
'</div>'+
'<div id = "contentarea">' + "\n" +
'<table>' + "\n";

		// init the channel with data and content type
		var chan = request.QueryInterface(nsIChannel);
		if (chan)
			chan.contentType = 'text/html';
		this._context = context;
		this._listener.onStartRequest(request, context);
		this._feedBeast(request, this._listener, context, ibuf);

	},

	onStopRequest : function(request, context, status) {
		this._buf +=
"</table>\n"+
"</div>\n"+
"</body>\n"+
"</html>\n";

		this._feedBeast(request, this._listener,
			this._context, this._buf);
		this._buf = '';
		this._listener.onStopRequest(request, this._context, status);
		this._listener = null;
		this._context = null;
		if (this._sstream)
			this._sstream.close();
		this._sstream = null;
	},

	// nsIStreamListener
	onDataAvailable : function(request, context, stream, offset, count) {
		var i;
		var obuf = '';

		if (!this._sstream) {
			// create (and cache) our scriptable input stream
			// note: this is NOT BINARY SAFE
			this._sstream = Components
				.classes["@mozilla.org/scriptableinputstream;1"]
				.createInstance(Components
					.interfaces.nsIScriptableInputStream);
			this._sstream.init(stream);
		}
		this._pbuf += this._sstream.read(count);
		while((i = this._pbuf.indexOf("\n")) > -1) {
			// pull the next tab-delimited string off the buffer
			var w = this._pbuf.substr(0, i);
			if (i < this._pbuf.length)
				this._pbuf = this._pbuf.substr(i+1);
			else
				this._pbuf = '';

			w = w.replace("\r", "");
			w = w.replace("\n", "");

			var itype = w.substr(0,1);

			var attribs = w.substr(1).split("\t");
			var ds = this._dsSpaceFix(this._entityFix(
				attribs.shift()));
			if (!ds.length)
				ds = "&nbsp;";

			var sel = attribs.shift();
			if (!sel)
				sel = '';

			var host = attribs.shift();
			if (host && host.length)
				host = encodeURI(host);
			var port = parseInt(attribs.shift());
			if (isNaN(port))
				port = 0; // falls through to bogosity filter
			var icalt = (this._itypes.indexOf(itype) > -1)
				? this._getL10NString(itype)
				: this._getL10NString('unknown');
			var iconbase = "gemini:///internal-";

			if (itype == "'" || itype == '"') {
				// these are just going to cause all kinds of
				// problems, so they are simply suppressed
				obuf +=
'<!-- suppressed problematic item type '+escape(itype)+" -->\n";
			} else if (itype == 'i' || itype == '3') {
				var lclass = (itype == '3') ? 'erroritem'
					: 'infoitem';
				if (itype == '3') {
					obuf += 
				'<tr><td class = "gicon">'
				+ '<img src = "' + iconbase + 'icn3.png" '
				+ 'alt = "[' + icalt + ']" '
				+ 'title = "[' + icalt + ']" '
				+ 'class = "gicon"></a></td>';
				//+ 'border = "0"></a></td>';
				} else
					obuf += "<tr><td></td>";
				obuf += '<td class = "ds">'
					+ '<span class = "' + lclass + '">'
					+ ds + "</span></td></tr>\n";
			} else if (host && host.length && port > 1) {
				var suburl;
				var icon = "icn.png";
				var lclass = "fileitem";

				if (itype == '8' || itype == 'T') {
					// don't let them inject
					// arbitrary HTML with "
					sel = sel.replace(/["']/g, "");
					suburl = "telnet://" + host + ":" +
						port + "/" + sel;
					var icon = "icn" + itype + ".png";
					var lclass = "telnetitem";
					icalt = this._getL10NString('telnet');
				} else if (itype == 'h' &&
					(sel.substr(0,4) == "URL:" ||
						sel.substr(0,5) == "/URL:")) {
					var subn = (sel.substr(0,1) == "/")
						? 5 : 4;
					suburl = encodeURI(sel.substr(subn));
					if (suburl.match(/^javascript:/) ||
						suburl.match(/^data:/)) {
						suburl = "";
						ds +=
			' <b>(' + this._getL10NString('unsafeurl') + ')</b>';
					}
					icon = "icnhURL.png";
					lclass = "urlitem";
					icalt = this._getL10NString('exturl');
				} else if (port >= 80 && itype == 'h' &&
						sel.match(/^[A-Z]+(%20| )/)) {
					sel = sel.replace(/^[A-Z]+(%20| )/,'');
					suburl = "http://"+host+":"+port+
						(sel.substr(0,1) == "/" ?
							"" : "/") +
						encodeURI(unescape(sel));
					icon = "icnhURL.png";
					lclass = "urlitem";
					icalt = this._getL10NString('exturl');
				} else {
					suburl = this._URLfromSel(host, port,
						itype, sel);
					// attempt to escape weird itypes
					var eitype = escape(itype);
					if (eitype.length > 1) // it was
						eitype = eitype.substr(1)
							.toLowerCase();
					icon = (this._itypes.indexOf(itype)>-1)
						? ("icn"+eitype+".png")
						: "icn.png";
					lclass = 
						(itype == '7' || itype == '2')
							? 'searchitem':
						(itype == '1') ? 'diritem' :
							'fileitem';
				}
					obuf +=
				'<tr><td class = "gicon">'
				+ '<a href = "'+ suburl +'">'
				+ '<img src = "' + iconbase + icon +'" '
				+ 'alt = "[' + icalt + ']" '
				+ 'title = "[' + icalt + ']" '
				+ 'class="gicon"></a></td>'
				+ '<td class = "ds">'
				+ '<a href = "'+suburl+'">'
				+ '<span class = "' + lclass + '">'
				+ ds + "</span></a></td></tr>\n";
			} else {
				obuf += // no point in localizing this, I think
				"<!-- bogus element suppressed -->\n";
			}
		}
		this._feedBeast(request, this._listener, this._context, obuf);
	},

	// nsIStreamConverter
	convert : function(from, to, listener, context) {
		// synchronous conversion will not be supported w/o good reason
		throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
	},
	asyncConvertData : function(from, to, listener, context) {
		// if this were a real translator, we'd uncomment this
//		if (from != "text/x-overbite-gopher-dir" || to != "text/html")
//			throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
		this._listener = listener;
		this._context = context;
	}
	
};

/*
 * the channel object that actually does the protocol negotiation.
*/

function GmnExplChannel(input_uri, proxyinfo) {
	this.init(input_uri, proxyinfo);
}

GmnExplChannel.prototype = {

	// my stuff
	_host : null,
	_port : null,
	_transport : null,
	_proxyinfo : null,
	_pump : null,
	_listener : null,
	_context : null,
	_progsink : null,

	csoargs : '',
	queryargs : '',
	transreq : null, // actual transmitted request (see sendRequest)

	// nsISupports
	QueryInterface : function (iid) {
		if (!iid.equals(nsIChannel)
				&& !iid.equals(nsIProxiedChannel)
				&& !iid.equals(nsIRequest)
				&& !iid.equals(nsISupports)) {
			throw Components.results.NS_ERROR_NO_INTERFACE;
		}
		return this;
	},

	// nsIRequest
	loadFlags : 0,
	name : null,
	isPending : false,
	_status : Components.results.NS_OK,
	_loadGroup : null,

	get status() {
		if (this._pump)
			return (this._pump.status);
		else
			return this._status;
	},
	set status(status) { this._status = status; },
	cancel : function(status) {
		if (this._pump)
			return (this._pump.cancel(status));
		else
			return Components.results.NS_OK;
	},
	suspend : function() {
		if (this._pump)
			return (this._pump.suspend());
		else
			return Components.results.NS_OK;
	},
	resume : function() {
		if (this._pump)
			return (this._pump.resume());
		else
			return Components.results.NS_OK;
	},

	// nsIChannel
	loadAttributes : null,
	contentCharset : null,
	contentLength : -1,
	contentType : null,
	_notificationCallbacks : null ,
	originalURI : null,
	owner : null,
	URI : null,
	init : function(input_uri, proxyinfo) {
		// constructor
		this.URI = input_uri;
		this.originalURI = input_uri;
		this.name = input_uri;
		if (proxyinfo)
			this._proxyinfo = proxyinfo;

		if (!input_uri.host || !input_uri.host.length)
			throw Components.results.NS_ERROR_MALFORMED_URI;
		else
			this._host = input_uri.host;
		if (!input_uri.port || input_uri.port < 1)
			this._port = 1965;
		else
			this._port = input_uri.port;

if(0){
		// force our itemtype. realistically, the old Gopher let people
		// slide a lot with content sniffing, but that's not going to
		// happen anymore. this is written to be as rigid as possible
		// for a particular itemtype (but see type I, sigh).
		var c;
		switch(this._itemtype) {
			case '1' :
			case '7' :
				c = 'application/x-overbite-gopher-dir';
				// this lets us override 1.9's gopher support
				break;

			case 'c' :
				c = 'text/css';
				break;

			case 'x' :
				c = 'application/xml'; // I miss text/xml
				break;

			case '0' :
			case '2' :
				c = 'text/plain';
				break;

			case 'g' :
				c = 'image/gif' ;
				break;

			case 'I' :
				// oh, man, this is gross -- designed to
				// support both the common use of I for
				// JPEG images, and the official spec that
				// I is a 'general image type' (we only
				// support the ones Mozilla will display)
				//
				// taken from netwerk/mime/public/nsMimeTypes.h
				if (this._selector.match(/\.jpe?g$/i))
					c = 'image/jpeg' ;
				else if (this._selector.match(/\.gif$/i))
					c = 'image/gif' ; // grrRRR! use 'g'!!
				else if (this._selector.match(/\.xbm$/i))
					c = 'image/x-xbitmap' ;
				else if (this._selector.match(/\.png$/i))
					c = 'image/png' ;
				else if (this._selector.match(/\.svg$/i))
					c = 'image/svg+xml' ;
				else if (this._selector.match(/\.bmp$/i))
					c = 'image/bmp' ;
				else if (this._selector.match(/\.icon?$/i))
					c = 'image/x-icon' ;
				else if (this._selector.match(/\.tiff?$/i))
					c = 'image/tiff' ;
				else
					c = 'image/jpeg' ;
					// this broke too many things
					//c = 'application/octet-stream';
				break;

			case 'h' :
				c = 'text/html';
				break;

			case 'p' :
				c = 'image/png';
				break;

			case 'd' :
				c = 'application/pdf';
				break;

			case '8' :
			case 'T' :
				throw Components.results
					.NS_ERROR_NOT_IMPLEMENTED;
				break;

			default :
				c = 'application/octet-stream';
				break;
		}
		this.contentType = c;
}
else {
		var basepath = input_uri.path.replace(/#.*$/,"").replace(/\?.*$/,"");
		var basename = basepath.substr(basepath.lastIndexOf("/")+1);
		// guess content type from filename
		// taken from netwerk/mime/public/nsMimeTypes.h
		if (basepath.match(/\.gmi$/i) || basepath.match(/\/$/) || !basename.match(/\./))
			c = 'text/html' ;
		else if (basepath.match(/\.html?$/i))
			c = 'text/html' ;
		else if (basepath.match(/\.jpe?g$/i))
			c = 'image/jpeg' ;
		else if (basepath.match(/\.gif$/i))
			c = 'image/gif' ; // grrRRR! use 'g'!!
		else if (basepath.match(/\.xbm$/i))
			c = 'image/x-xbitmap' ;
		else if (basepath.match(/\.png$/i))
			c = 'image/png' ;
		else if (basepath.match(/\.svg$/i))
			c = 'image/svg+xml' ;
		else if (basepath.match(/\.bmp$/i))
			c = 'image/bmp' ;
		else if (basepath.match(/\.icon?$/i))
			c = 'image/x-icon' ;
		else if (basepath.match(/\.tiff?$/i))
			c = 'image/tiff' ;
		else if (basepath.match(/\.pdf$/i))
			c = 'application/pdf' ;
		else if (basepath.match(/\.txt$/i))
			c = 'text/plain' ;
		else
			c = 'application/octet-stream';

		this.contentType = c;
}
		//this.contentType = 'text/html';

		GmnExplLog(("channel initialized: "+
			this._host + " " +
			this._port + " " +
			""));
		return Components.results.NS_OK;
	},
			
	/* open is not being implemented */
	open : function() {
		throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
	},

	asyncOpen : function (listener, context) {
		GmnExplLog(("trying to initialize transport"));

		var transportService = Components
		.classes["@mozilla.org/network/socket-transport-service;1"]
			.getService(Components
				.interfaces.nsISocketTransportService);
		this._transport = transportService
			.createTransport(['ssl'], 1,
				this._host,
				this._port,
				this._proxyinfo);
		if (!(this.loadFlags & nsIRequest.LOAD_BACKGROUND)) {
			// hook up our event sink to the current UI thread

			// 1.8
			var obj = Components
				.classes["@mozilla.org/event-queue-service;1"]
				.getService(nsIEventQueueService);
			// don't use resolveEventQueue - not scriptable
			var cq = obj.getSpecialEventQueue(
			nsIEventQueueService.CURRENT_THREAD_EVENT_QUEUE) // 0
				;






			GmnExplLog("yes, we have sink "+cq);
			this._transport.setEventSink(this, cq);
		}
		// open and initialize the data pump to read from the socket
		var sinput =
			this._transport.openInputStream(0,0,0);
		this.sendRequest();
		this._pump = Components.
			classes["@mozilla.org/network/input-stream-pump;1"].
			createInstance(Components.
				interfaces.nsIInputStreamPump);
		this._pump.init(sinput, -1, -1, 0, 0, true);
		this._pump.asyncRead(this, null);
		if (this._loadGroup) {
			this._loadGroup.addRequest(this, null);
			GmnExplLog("load group added");
		}
		this.isPending = true;
		this._listener = listener;
		this._context = context;

if(0){
		// push on another content listener (in this case us) for
		// those itemtypes requiring translation to something else
		var transitives = [ '1', '7' ]; // item types for translation
		if (transitives.indexOf(this._itemtype) > -1) {
			GmnExplLog(("this type requires translation"));
			var dirconv = new GmnExplDirconv();
			dirconv.asyncConvertData(
				'application/x-overbite-gopher-dir',
				'text/html',
				this._listener,
				this._context);
			this._listener = dirconv;
			this._context = null;
			GmnExplLog(("now with dirconv: "+dirconv));
		}	
}

		var gelistener = new GmnExplListener();
		gelistener.asyncConvertData(
			'application/octet-stream',
			this.contentType,
			this._listener,
			this._context);
		this._listener = gelistener;
		this._context = null;

		GmnExplLog(("transport service for "+
			this._host + " initialized"));
		return Components.results.NS_OK;
	},

	get loadGroup() { return this._loadGroup; },
	set loadGroup(loadGroup) {
		this._loadGroup = loadGroup;
		this._progsink = null;
	},
	get notificationCallbacks() {
		return this._notificationCallbacks;
	},
	set notificationCallbacks(nc) {
		this._notificationCallbacks = nc;
		this._progsink = null;
	},
	get securityInfo() {
		if (this._transport)
			return this._transport.securityInfo;
		//throw Components.results.NS_ERROR_NOT_AVAILABLE;
		return null;
	},
	// set securityInfo? bwahahaha
	set securityInfo(foo) {
		throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
		return null;
	},

	
	onStartRequest : function(request, context) {
		if (this._listener)
			this._listener.onStartRequest(this,
				this._context);
		GmnExplLog(("onStartRequest"+this._listener));
	},
	onStopRequest : function(request, context, status) {
		GmnExplLog(("onStopRequest: "+status));
		if(Components.isSuccessCode(status))
			this.status = status;

		if (this._listener) {
			this._listener.onStopRequest(this,
					this._context,
					this.status);
			GmnExplLog("listener stopped");
			this._listener = null;
			this._context = null;
		}
		if (this._loadGroup) {
			this._loadGroup.removeRequest(this,
				context, // null,
				this.status);
			GmnExplLog("load group stopped");
		}

		this._pump = null;
		this._transport.close(this.status);
		this._transport = null;
		this.notificationCallbacks = null; // use our own getter/setter
		this._progsink = null;

		GmnExplLog("end of request");
		// lookit nsNetError.h
		return Components.results.NS_OK;
	},
	onDataAvailable : function(request, context, inputStream, offset,
			count) {
		GmnExplLog(("data event"));
		if (this._listener) {
			this._listener.onDataAvailable(this,
					this._context,
					inputStream,
					offset,
					count);
		}
		GmnExplLog(("data available: "+count+" bytes"));
	},
	sendRequest : function() {
		var transtring = this.URI.asciiSpec;

if(0){
		// the original version put up the itemtype 7 dialogue
		// at the channel, but I like throwing ABORTs early,
		// so we're doing that at the protocol handler level.
		// ditto for CSO/ph searches.
		if (this.csoargs && this.csoargs.length) {
			// completely replace selector with CSO/ph query
			// this eliminates a lot of headaches!!
			if (!this.csoargs.match(/^query /i)) // already query?
				transtring="query "+this.csoargs+" return all";
			else
				transtring=this.csoargs;
		} else if (this.queryargs && this.queryargs.length)
			transtring += "\t" + this.queryargs;
}
		transtring += "\r\n";
if(0){
		// add terminating quit command to our query just in case
		// if this is CSO/ph
		if (this._itemtype == "2")
			transtring += "quit\r\n";
}

		GmnExplLog(("transtring = "+transtring));

		// send the data
		var outstream = this._transport
			.openOutputStream(0,0,0);
		outstream.write(transtring, transtring.length);
		this.transreq = transtring; // for debugging
		outstream.close();
		GmnExplLog("selector sent: "+escape(transtring));
	},
	onTransportStatus : function(trans, status, prog, progmax) {
		this._progsink = GmnExplQNC(this, this._loadGroup,
				this._progsink);
		if (!this._progsink)
			GmnExplLog(("crap: no progsink"));
		GmnExplLog(("status changed: "+status+this._loadGroup+
			this.notificationCallbacks+this._progsink));
		if (this._progsink &&
		// wtf?! this doesn't work, so I'm commenting it out
		//		Components.isSuccessCode(status) &&
		//		this._pump &&
			!(this.loadFlags & nsIRequest.LOAD_BACKGROUND)){
			this._progsink.onStatus(this, 
				this._context,
				status,
				this.URI.asciiHost);
			GmnExplLog(("onStatus"));
			
			if (status == nsISocketTransport.STATUS_RECEIVING_FROM
				||
				status == nsISocketTransport.STATUS_SENDING_TO
				) {
				this._progsink.onProgress(this,
					this._context,
					prog, -1);
				GmnExplLog(("onProgress"));
			}
		}
		return Components.results.NS_OK;
	}

};
	
function GmnExplProtocol() { }

GmnExplProtocol.prototype = {
	QueryInterface : function(iid) {
		if (!iid.equals(nsIProtocolHandler) &&
				!iid.equals(nsIProxiedProtocolHandler) &&
				!iid.equals(nsISupports)) {
			throw Components.results.NS_ERROR_NO_INTERFACE;
		}
		return this;
	},

	// our stuff

	// l10n/i18n support -- load our string bundles
	_bundle : Components.classes["@mozilla.org/intl/stringbundle;1"]
		.getService(Components
			.interfaces.nsIStringBundleService)
		.createBundle(GMNXCHROMEURL + "/locale/obff.properties"),
	_getL10NString : function(msg, args) {
		if (args) 
			return this._bundle.formatStringFromName(msg, args,
				args.length);
		else
			return this._bundle.GetStringFromName(msg);
	},

	// nsIProtocolHandler
	scheme: GMNXSCHEME,
	defaultPort: 1965,
	protocolFlags: 0
			//| nsIProtocolHandler.URI_NORELATIVE
			| nsIProtocolHandler.ALLOWS_PROXY
			| nsIProtocolHandler.ALLOWS_HTTP_PROXY
			// for FF2
			| ((nsIProtocolHandler.URI_LOADABLE_BY_ANYONE)
				? nsIProtocolHandler.URI_LOADABLE_BY_ANYONE
				: 0)
		,
  
	allowPort : function(port, scheme) {
		// explicitly overridden -- these are common
		// and should never be blacklisted
		// we also include whois, finger and CSO/ph since gemini
		// necessarily subsumes all of those protocols very easily
		return (alwayslet.indexOf(port) != -1);
	},

	newURI : function(spec, charset, baseURI) {
		var uri = Components
			.classes["@mozilla.org/network/standard-url;1"]
			.createInstance(Components
				.interfaces.nsIURI);
		uri.spec = spec;
		return uri;
	},

	newChannel : function(input_uri) {
		GmnExplLog("new request for "+input_uri.asciiSpec);
		return this.newProxiedChannel(input_uri, null);
	},

	// nsIProxiedProtocolHandler 
	newProxiedChannel : function(input_uri, proxyinfo) {
		var ioService = Components
			.classes["@mozilla.org/network/io-service;1"]
			.getService(Components
				.interfaces.nsIIOService);
		var prompter = Components
			.classes["@mozilla.org/embedcomp/prompt-service;1"]
			.getService(Components
				.interfaces.nsIPromptService);

		GmnExplLog("new proxied request for "+input_uri.asciiSpec);
		if (proxyinfo)
			GmnExplLog("proxy is: "+proxyinfo);

if(0){
		// handle hURLs directly here (and reject Javascript
			// and data:)
		if (input_uri.path.match(/^\/?h\/?URL:.+/)) {
			var newuri = input_uri.path.replace(
				/^\/?h\/?URL:\/?/, "");
			GmnExplLog("URL REDIRECT: "+newuri);

			// reject unsafe destination schemes
			if (newuri.match(/^javascript:/) ||
					newuri.match(/^data:/)) {
				prompter.alert(null,
					this._getL10NString('hurl.error.title',
						[newuri]),
					this._getL10NString('hurl.error'));
				throw Components.results.NS_ERROR_ABORT;
				return null;
			}

			var rv = prompter.confirm(null,
				this._getL10NString('hurl.warning.title'),
				this._getL10NString('hurl.warning', [newuri]));
			if (rv) {
				var wm = Components
					.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components
						.interfaces
						.nsIWindowMediator);
				wm.getMostRecentWindow('navigator:browser')
					.getBrowser().webNavigation.loadURI(
						newuri, 0, null, null, null);
				// this is a bit cheap, but we don't want
				// FF freaking that we didn't give it a channel
				throw Components.results.NS_ERROR_ABORT;
				return null; // above will do redirect
			} else {
				throw Components.results.NS_ERROR_ABORT;
				return null;
			}
		}

		// handle itemtype 7 at this stage and turn into a channel
		// for itemtype 1 instead, except if this particular URL has
		// arguments (but wouldn't you want to do that as itype 1?).
		if (input_uri.path.substr(0,2) == "/7" &&
				input_uri.path.indexOf("?") == -1) {
			// why does prompt need a null object for the
			// checkbox when we aren't using it??
			var chequestub = { value : false };
			var query = { value : '' };
			// we will accept "blank" responses -- could be valid
			var rv = prompter.prompt(null,
				this._getL10NString('search.title'),
				this._getL10NString('search'),
				query, null, chequestub);
			if (!rv) {
				throw Components.results.NS_ERROR_ABORT;
				return null;
			}
			// stuff query into channel query args rather than
			// kludging it into a URL
			var ob = new GmnExplChannel(input_uri, proxyinfo);
			ob.queryargs = query.value;
			return ob;
		}

		// similarly handle itemtype 2
		// if it's /2....fjhgkrjgh then pass that on to the CSO server
		// (it's a fully qualified query that requires no parsing)
		if (input_uri.path == "/2" || input_uri.path == "/2/") {
			// why does prompt need a null object for the
			// checkbox when we aren't using it??
			var chequestub = { value : false };
			var query = { value : '' };
			// unlike itype 7 we MUST enter a query for this
			var rv = prompter.prompt(null,
				this._getL10NString('cso.title'),
				this._getL10NString('cso'),
				query, null, chequestub);
			if (rv && !query.value.length) // blank query
				prompter.alert(null,
					this._getL10NString('csobogus.title'),
					this._getL10NString('csobogus'));
			if (!rv || !query.value.length) {
				throw Components.results.NS_ERROR_ABORT;
				return null;
			}
			// stuff query into channel csoargs
			var ob = new GmnExplChannel(input_uri, proxyinfo);
			ob.csoargs = query.value;
			return ob;
		}
}

		// make chrome channel either to images or CSS if
		// input_uri is "gemini:///internal-" and no / and
		// extension is .png or .css
		if (!input_uri.host.length &&
				// PARANOIA STRIKES DEEP IN THE HEARTLAND!!!1
				!input_uri.path.substr(1).match(/\//) &&
		input_uri.path.match(/^\/internal-[^/ ]+\.(css|png)$/)) {
			GmnExplLog("handling internal chrome: "
				+input_uri.asciiSpec);
			var IURL;
			var mpath = input_uri.path.substr(1)
				.replace(/^internal-/, "");

			// try profile directory
			var dirService = Components
				.classes["@mozilla.org/file/directory_service;1"]
				.getService(Components
					.interfaces.nsIProperties);

			var uprof = dirService.get(
				"ProfD", Components.interfaces.nsIFile);
			var basedir = "geminichrome";
			//uprof.appendRelativePath(basedir);
			uprof.append(basedir);

			if (uprof.exists() && uprof.isDirectory()) {
				// use the user's geminichrome directory for
				// CSS and icons
				GmnExplLog("trying user directory");
				var fileProServ = Components
					.classes["@mozilla.org/network/io-service;1"]
					.getService(Components
						.interfaces.nsIIOService)
					.getProtocolHandler("file")
					.QueryInterface(Components
						.interfaces
						.nsIFileProtocolHandler);

				uprof.append(mpath);
				if (uprof.exists() && uprof.isFile())
					IURL = fileProServ.getURLSpecFromFile(
						uprof);
			}
			if (!IURL) {
				GmnExplLog("trying internal chrome dir");
				IURL = GMNXCHROMEURL+ "/content/chrome/"
					+mpath;
			}
			GmnExplLog("resulting URL: "+IURL);
			return ioService.newChannel(IURL, null, null);
		}

		// otherwise
		// make chrome channel to about page if
			// input_uri lacks a hostname
		if (!input_uri.host.length) {
			GmnExplLog("internal about page served up instead");
			GmnExplSetPrefs(); // sigh
			return ioService.newChannel(
				GMNXABOUTURL,
				null, null);
		}

if(0){
		// otherwise
		// immediately reject "pseudo" item types we don't handle
		// do this here because it traps internal URLs
		var wontshow = ['/i', '/3', '/8', '/T'];
		if (input_uri.path && input_uri.path.length > 1 &&
			wontshow.indexOf(input_uri.path.substr(0,2)) > -1) {
			prompter.alert(null,
				this._getL10NString('baditype.title'),
				this._getL10NString('baditype'));
			throw Components.results.NS_ERROR_ABORT;
			return null;
		}
}

		// silently reject port numbers we will never allow
		//if (badports.indexOf(input_uri.port) > -1) {
		if (input_uri.port && input_uri.port >= 0
				&& alwayslet.indexOf(input_uri.port)== -1) {
			GmnExplLog("illegal port: "+input_uri.port);
			throw Components.results
				.NS_ERROR_PORT_ACCESS_NOT_ALLOWED;
			return null;
		}

		// else it's a legit gemini request
		// make our channel and gemini it
		return new GmnExplChannel(input_uri, proxyinfo);
	}
};

/* global code that's guaranteed(?) to run the first time our extension is
	installed -- but thereafter prn only */

/* this is implemented somewhat differently from before because we're only
	doing singleton objects for our Factory and Module */

var GmnExplProtocolFactory = new Object();

GmnExplProtocolFactory.createInstance = function (outer, iid) {
	if (outer != null) {
		throw Components.results.NS_ERROR_NO_AGGREGATION;
	}

	if (!iid.equals(nsIProtocolHandler) && 
			!iid.equals(nsIProxiedProtocolHandler) &&
			!iid.equals(nsISupports)) {
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}

	return new GmnExplProtocol();
}

var GmnExplModule = new Object();

GmnExplModule.registerSelf = function (compMgr, fileSpec, location, type) {
	compMgr = compMgr.
		QueryInterface(Components.interfaces.nsIComponentRegistrar);
	compMgr.registerFactoryLocation(GMNXPROT_HANDLER_CID,
		"Gemini protocol handler", GMNXPROT_HANDLER_CONTRACTID, 
		fileSpec, location, type);
}

GmnExplModule.unregisterSelf = function(compMgr, fileSpec, location) {
	compMgr = compMgr.
		QueryInterface(Components.interfaces.nsIComponentRegistrar);
	compMgr.unregisterFactoryLocation(GMNXPROT_HANDLER_CID, fileSpec);
}

GmnExplModule.getClassObject = function (compMgr, cid, iid) {
	if (cid.equals(GMNXPROT_HANDLER_CID)) {
		return GmnExplProtocolFactory;
	}
/*
	// perhaps someday
	if (cid.equals(GMNXCNT_HANDLER_CID)) {
		return GmnExplContentHandlerFactory;
	}
*/
	if (iid.equals(Components.interfaces.nsIFactory)) {
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
	throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
}

GmnExplModule.canUnload = function(compMgr) { return true; }
function NSGetModule(compMgr, fileSpec) { return GmnExplModule; }

function GmnExplSetPrefs() {
	var prefs = Components.classes["@mozilla.org/preferences-service;1"];
	var prefserv = prefs.getService(Components.interfaces.nsIPrefService);
	prefs = prefs.getService(Components.interfaces.nsIPrefBranch);
	prefs.setIntPref(GMNXBUILDPREF, GMNXBUILD);
	prefserv.savePrefFile(null);
}

GmnExplLog("startup with version "+GMNXVERS+" build "+GMNXBUILD);

var prefs = Components.classes["@mozilla.org/preferences-service;1"];
var prefserv = prefs.getService(Components.interfaces.nsIPrefService);
prefs = prefs.getService(Components.interfaces.nsIPrefBranch);
if (prefs.getPrefType(GMNXBUILDPREF) != prefs.PREF_INT ||
		prefs.getIntPref(GMNXBUILDPREF) < GMNXBUILD) {

	// 1.8 does not properly pop windows

	GmnExplSetPrefs();
	GmnExplLog("set buildmark for Moz1.8");
}

