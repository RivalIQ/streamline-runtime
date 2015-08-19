"use strict";
// colors package does not work in browser - fails on reference to node's `process` global
var idem = function(x) { return x; };
var colors = typeof(process) === 'undefined' ? 
	['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'].reduce(function(r, c) {
		r[c] = idem;
		return r;
	}, {}) : require(idem('colors'));

function log(message) {
	console.error(colors.gray("[STREAMLINE-RUNTIME] " + message));
}
function warn(message) {
	console.error(colors.magenta("[STREAMLINE-RUNTIME] " + message));
}
function error(message) {
	console.error(colors.red("[STREAMLINE-RUNTIME] " + message));
}

function trace(obj) {
	if (obj instanceof TypeError) util.error(obj.stack);
	//else console.error(obj);
};

function typeName(val) {
	return val === null ? "null" : typeof val;
}

function typeError(message, expected, got) {
	var err = new TypeError(message + ": expected " + expected + ", got " + typeName(got));
	console.error(err.stack);
	throw err;
}

function argError(fname, index, expected, got) {
	return typeError("invalid argument " + index + " to function `" + fname + "`", expected, got);
}

function getGlobals(runtime) {
	var glob = typeof global === "object" ? global : window;
	var secret = "_20c7abceb95c4eb88b7ca1895b1170d1";
	var g = (glob[secret] = (glob[secret] || {}));
	if (runtime && g.runtime && g.runtime !== runtime) 
		console.warn("[STREAMLINE-RUNTIME] " + runtime + " runtime loaded on top of " + g.runtime);
	return g;
}

module.exports = {
	log: log,
	warn: warn,
	error: error,
	trace: trace,
	typeName: typeName,
	typeError: typeError,
	argError: argError,
	getGlobals: getGlobals,
};
var util = module.exports;
