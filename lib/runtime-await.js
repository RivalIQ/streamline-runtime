"use strict";

var util = require('./util');
var trace = console.error.bind(console);

var PromiseClass;
if (false && typeof Promise === 'undefined') {
	util.warn('No promise library available. Using es6-promise');
	PromiseClass = require('bluebird'); // 'es6-promise');
} else {
	PromiseClass = Promise;
}

var setImmediate = typeof setImmediate === 'function' ? setImmediate : setTimeout;

// forceImmediate:
//	0 to disable
//	1 to force on every call
//	2 to force setImmediate instead of nextTick

var forceImmediate = 1; 
if (forceImmediate === 2 && typeof process !== 'undefined') process.nextTick = setImmediate;

var g = util.getGlobals('await');

exports.await = function(object, property, index1, index2, returnArray) {
	var bound = typeof property !== "function";
	var fn = bound ? object[property] : property;
	if (typeof fn !== "function") throw util.typeError("cannot call", "function", fn);
	var key = 'awaitWrapper-' + index1 + '-' + index2 + '-' + returnArray;
	var wrapper = fn[key];
	if (wrapper) return wrapper;
	wrapper = function() {
		var args = Array.prototype.slice.call(arguments),
			arg = args[index1];
		if (typeof arg !== 'boolean') throw util.argError(fn.name, index1, 'boolean', arg);
		var cx = g.context;
		var promise = new PromiseClass(function(resolve, reject) {
			var callback = function(err, result) {
				//if (err) trace && trace(err.stack);
				//else trace && trace(fn.name, result && typeof(result));
				if (returnArray && !err) result = Array.prototype.slice.call(arguments, 1);
				if (sync || forceImmediate === 1) {
					setImmediate(function() {
						g.context = cx;
						if (err) reject(err);
						else resolve(result);					
					});
				} else {
					g.context = cx;
					if (err) reject(err);
					else resolve(result);										
				}
			};
			if (index2 != null) {
				args[index1] = function(r) { callback(null, r); }
				args[index2] = function(e) { callback(e); }
			} else {
				args[index1] = callback;
			}
		})
		var sync = true;
		fn.apply(bound ? object: this, args);
		sync = false;
		return promise;
	};
	if (!bound) {
		fn[key] = wrapper;
		wrapper['asyncWrapper-' + index1] = fn;
	}
	return wrapper;
};


exports.async = function(fn, index) {
	if (typeof fn !== "function") throw util.typeError("cannot wrap function", "function", fn);
	var key = 'asyncWrapper-' + index;
	var wrapper = fn[key];
	if (wrapper) return wrapper;
	wrapper = function() {
		var self = this;
		var args = Array.prototype.slice.call(arguments);
		var cb = args[index];
		if (typeof cb !== "function") {
			// if cb is false, return a future
			//if (cb === false) return future(null, wrapper.bind(self), args);
			throw util.argError(fn.name, index, "function", typeof cb);
		}
		var cx = g.context;
		fn.apply(this, args).then(function(result) {
			g.context = cx;
			cb.call(self, null, result);
		}, function(err) {
			//trace && trace(err);
			g.context = cx;
			cb.call(self, err);
		});
	};
	wrapper['awaitWrapper-' + index + '-null-false'] = fn;
	fn[key] = wrapper;
	return wrapper;
}

exports.new = function(constructor, index) {
	if (typeof constructor !== "function") throw util.typeError("cannot instantiate", "function", constructor);
	return function() {
		var args = Array.prototype.slice.call(arguments);
		var that = Object.create(constructor.prototype);
		args[index] = true;
		return new PromiseClass(function(resolve, reject) {
			exports.await(null, constructor, index, null, false).apply(that, args).then(function(result) {
				resolve(that);
			}, reject);
		});
	};
}

exports.future = require('./future');