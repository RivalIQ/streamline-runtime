"use strict";

var galaxy = require('galaxy');
var util = require('./util');

exports.await = function(object, property, index1, index2, returnArray) {
	var bound = typeof property !== "function";
	var that = bound ? object : null;
	var fn = bound ? object[property] : property;
	if (typeof fn !== "function") throw util.typeError("cannot call", "function", fn);
	return galaxy.star(fn, {
		callbackIndex: index1,
		errbackIndex: index2,
		returnArray: returnArray,
	}).bind(that);
};

exports.async = function(fn, index) {
	if (typeof fn !== "function") throw util.typeError("cannot wrap function", "function", fn);
	var unstarred = galaxy.unstar(fn, index);
	unstarred["awaitWrapper-" + index + "-null-false"] = fn;
	return unstarred;
}

exports.new = function(constructor, index) {
	if (typeof constructor !== "function") throw util.typeError("cannot instantiate", "function", constructor);
	return galaxy.new(galaxy.star(constructor, index), index);
};

exports.future = require('./future');