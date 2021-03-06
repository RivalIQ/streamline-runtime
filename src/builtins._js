/**
 * Copyright (c) 2012 Bruno Jouhier <bruno.jouhier@sage.com>
 * MIT License
 */
/// !doc
/// 
/// # Streamline built-ins
///  
(function (exports) {
	"use strict";
	var VERSION = 3;

	var future = function (fn, args, i) {
		var err, result, done, q = [],
			self = this;
		args = Array.prototype.slice.call(args);
		args[i] = function (e, r) {
			err = e;
			result = r;
			done = true;
			q && q.forEach(function (f) {
				f.call(self, e, r);
			});
			q = null;
		};
		fn.apply(this, args);
		return function F(cb) {
			if (!cb) return F;
			if (done) cb.call(self, err, result);
			else q.push(cb);
		};
	};

	var funnel = function (max) {
		max = max == null ? -1 : max;
		if (max === 0) max = exports.funnel.defaultSize;
		if (typeof max !== "number") throw new Error("bad max number: " + max);
		var queue = [],
			active = 0,
			closed = false;

		function _doOne() {
			var current = queue.shift();
			if (!current.cb) return current.fn();
			active++;
			current.fn(function (err, result) {
				active--;
				if (!closed) {
					current.cb(err, result);
					while (active < max && queue.length > 0) _doOne();
				}
			});
		}

		function overflow(callback, fn) {
			queue.push({
				fn: fn,
				cb: callback
			});
		}

		var fun = function (_, fn) {
			//console.log("FUNNEL: active=" + active + ", queued=" + queue.length);
			if (max < 0 || max === Infinity) return fn(_);
			// optimization to avoid _ -> callback transition in fibers mode when the funnel is available.
			if (active < max) {
				active++;
				try {
					return fn(_);
				} finally {
					active--;
					while (active < max && queue.length > 0) _doOne();
				}
			} else {
				return overflow(_, fn);
			}
		}

		fun.close = function () {
			queue = [];
			closed = true;
		};
		return fun;
	};
	funnel.defaultSize = 4;

	exports.funnel = funnel;

	function _parallel(options) {
		if (typeof options === "number") return options;
		if (typeof options.parallel === "number") return options.parallel;
		return options.parallel ? -1 : 1;
	}

	if (Array.prototype.forEach_ && Array.prototype.forEach_.version_ >= VERSION) return;

	// bail out (silently) if JS does not support defineProperty (IE 8).
	try {
		Object.defineProperty({}, 'x', {});
	} catch (e) {
		return;
	}

	var has = Object.prototype.hasOwnProperty;

	/* eslint-disable no-extend-native */

	/// ## Array functions  
	/// 
	/// These functions are asynchronous variants of the EcmaScript 5 Array functions.
	/// 
	/// Common Rules: 
	/// 
	/// These variants are postfixed by an underscore.  
	/// They take the `_` callback as first parameter.  
	/// They pass the `_` callback as first argument to their `fn` callback.  
	/// Most of them have an optional `options` second parameter which controls the level of 
	/// parallelism. This `options` parameter may be specified either as `{ parallel: par }` 
	/// where `par` is an integer, or directly as a `par` integer value.  
	/// The `par` values are interpreted as follows:
	/// 
	/// * If absent or equal to 1, execution is sequential.
	/// * If > 1, at most `par` operations are parallelized.
	/// * if 0, a default number of operations are parallelized. 
	///   This default is defined by `flows.funnel.defaultSize` (4 by default - see `flows` module).
	/// * If < 0 or Infinity, operations are fully parallelized (no limit).
	/// 
	/// Functions:
	/// 
	/// * `array.forEach_(_[, options], fn[, thisObj])`  
	///   `fn` is called as `fn(_, elt, i, array)`.
	delete Array.prototype.forEach_;
	Object.defineProperty(Array.prototype, 'forEach_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (_, options, fn, thisObj) {
			if (typeof options === "function") {
				thisObj = fn;
				fn = options;
				options = 1;
			}
			var par = _parallel(options);
			thisObj = thisObj !== undefined ? thisObj : this;
			var len = this.length;
			if (par === 1 || len <= 1) {
				for (var i = 0; i < len; i++) {
					if (has.call(this, i)) fn.call(thisObj, _, this[i], i, this);
				}
			} else {
				this.map_(_, par, fn, thisObj);
			}
			return this;
		}
	});
	Array.prototype.forEach_.version_ = VERSION;
	/// * `result = array.map_(_[, options], fn[, thisObj])`  
	///   `fn` is called as `fn(_, elt, i, array)`.
	delete Array.prototype.map_;
	Object.defineProperty(Array.prototype, 'map_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (_, options, fn, thisObj) {
			if (typeof options === "function") {
				thisObj = fn;
				fn = options;
				options = 1;
			}
			var par = _parallel(options);
			thisObj = thisObj !== undefined ? thisObj : this;
			var len = this.length;
			var result, i;
			if (par === 1 || len <= 1) {
				result = new Array(len);
				for (i = 0; i < len; i++) {
					if (has.call(this, i)) result[i] = fn.call(thisObj, _, this[i], i, this);
				}
			} else {
				var futures = [];
				i = 0;
				result = new Array(len);
				if (par <= 0) par = len;
				// cap with a hard limit to avoid memory issue with fibers
				par = Math.min(par, 256);
				for (var j = 0; j < par; j++) futures[j] = (_ => {
					while (i < this.length) {
						var k = i++;
						if (has.call(this, k)) result[k] = fn.call(thisObj, _, this[k], k, this);
					}
				})(!_);
				for (var j = 0; j < par; j++) futures[j](_);
			}
			return result;
		}
	});
	/// * `result = array.filter_(_[, options], fn[, thisObj])`  
	///   `fn` is called as `fn(_, elt, i, array)`.
	delete Array.prototype.filter_;
	Object.defineProperty(Array.prototype, 'filter_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (_, options, fn, thisObj) {
			if (typeof options === "function") {
				thisObj = fn;
				fn = options;
				options = 1;
			}
			var par = _parallel(options);
			thisObj = thisObj !== undefined ? thisObj : this;
			var result = [];
			var len = this.length;
			if (par === 1 || len <= 1) {
				for (var i = 0; i < len; i++) {
					if (has.call(this, i)) {
						var elt = this[i];
						if (fn.call(thisObj, _, elt, i, this)) result.push(elt);
					}
				}
			} else {
				this.map_(_, par, function (_, elt, i, arr) {
					if (fn.call(thisObj, _, elt, i, arr)) result.push(elt);
				}, thisObj);
			}
			return result;
		}
	});
	/// * `bool = array.every_(_[, options], fn[, thisObj])`  
	///   `fn` is called as `fn(_, elt, i, array)`.
	delete Array.prototype.every_;
	Object.defineProperty(Array.prototype, 'every_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (_, options, fn, thisObj) {
			if (typeof options === "function") {
				thisObj = fn;
				fn = options;
				options = 1;
			}
			var par = _parallel(options);
			thisObj = thisObj !== undefined ? thisObj : this;
			var len = this.length, i;
			if (par === 1 || len <= 1) {
				for (i = 0; i < len; i++) {

					if (has.call(this, i) && !fn.call(thisObj, _, this[i], i, this)) return false;
				}
			} else {
				var fun = funnel(par);
				var futures = this.map(function (elt, i, arr) {
					return fun(!_, function (_) {
						return fn.call(thisObj, _, elt, i, arr);
					});
				});
				for (i = 0; i < len; i++) {
					if (has.call(this, i) && !futures[i](_)) {
						fun.close();
						return false;
					}
				}
			}
			return true;
		}
	});
	/// * `bool = array.some_(_[, options], fn[, thisObj])`  
	///   `fn` is called as `fn(_, elt, i, array)`.
	delete Array.prototype.some_;
	Object.defineProperty(Array.prototype, 'some_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (_, options, fn, thisObj) {
			if (typeof options === "function") {
				thisObj = fn;
				fn = options;
				options = 1;
			}
			var par = _parallel(options);
			thisObj = thisObj !== undefined ? thisObj : this;
			var len = this.length, i;
			if (par === 1 || len <= 1) {
				for (i = 0; i < len; i++) {
					if (has.call(this, i) && fn.call(thisObj, _, this[i], i, this)) return true;
				}
			} else {
				var fun = funnel(par);
				var futures = this.map(function (elt, i, arr) {
					return fun(!_, function (_) {
						return fn.call(thisObj, _, elt, i, arr);
					});
				});
				for (i = 0; i < len; i++) {
					if (has.call(this, i) && futures[i](_)) {
						fun.close();
						return true;
					}
				}
			}
			return false;
		}
	});
	/// * `result = array.reduce_(_, fn, val[, thisObj])`  
	///   `fn` is called as `val = fn(_, val, elt, i, array)`.
	delete Array.prototype.reduce_;
	Object.defineProperty(Array.prototype, 'reduce_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (_, fn, v, thisObj) {
			thisObj = thisObj !== undefined ? thisObj : this;
			var len = this.length;
			for (var i = 0; i < len; i++) {
				if (has.call(this, i)) v = fn.call(thisObj, _, v, this[i], i, this);
			}
			return v;
		}
	});
	/// * `result = array.reduceRight_(_, fn, val[, thisObj])`  
	///   `fn` is called as `val = fn(_, val, elt, i, array)`.
	delete Array.prototype.reduceRight_;
	Object.defineProperty(Array.prototype, 'reduceRight_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (_, fn, v, thisObj) {
			thisObj = thisObj !== undefined ? thisObj : this;
			var len = this.length;
			for (var i = len - 1; i >= 0; i--) {
				if (has.call(this, i)) v = fn.call(thisObj, _, v, this[i], i, this);
			}
			return v;
		}
	});

	/// * `array = array.sort_(_, compare [, beg [, end]])`  
	///   `compare` is called as `cmp = compare(_, elt1, elt2)`.  
	///   Note: this function _changes_ the original array (and returns it).
	delete Array.prototype.sort_;
	Object.defineProperty(Array.prototype, 'sort_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (_, compare, beg, end) {
			var array = this;
			beg = beg || 0;
			end = end == null ? array.length - 1 : end;

			function _qsort(_, beg, end) {
				if (beg >= end) return;

				var tmp;
				if (end === beg + 1) {
					if (compare(_, array[beg], array[end]) > 0) {
						tmp = array[beg];
						array[beg] = array[end];
						array[end] = tmp;
					}
					return;
				}

				var mid = Math.floor((beg + end) / 2);
				var o = array[mid];
				var nbeg = beg;
				var nend = end;

				while (nbeg <= nend) {
					while (nbeg < end && compare(_, array[nbeg], o) < 0) nbeg++;
					while (beg < nend && compare(_, o, array[nend]) < 0) nend--;

					if (nbeg <= nend) {
						tmp = array[nbeg];
						array[nbeg] = array[nend];
						array[nend] = tmp;
						nbeg++;
						nend--;
					}
				}

				if (nbeg < end) _qsort(_, nbeg, end);
				if (beg < nend) _qsort(_, beg, nend);
			}
			_qsort(_, beg, end);
			return array;
		}
	});

	/// 
	/// ## Function functions  
	/// 
	/// * `result = fn.apply_(_, thisObj, args[, index])`  
	///   Helper to use `Function.prototype.apply` inside streamlined functions.  
	///   Equivalent to `result = fn.apply(thisObj, argsWith_)` where `argsWith_` is 
	///   a modified `args` in which the callback has been inserted at `index` 
	///   (at the end of the argument list if `index` is omitted or negative).
	delete Function.prototype.apply_;
	Object.defineProperty(Function.prototype, 'apply_', {
		configurable: true,
		writable: true,
		enumerable: false,
		value: function (callback, thisObj, args, index) {
			args = Array.prototype.slice.call(args, 0);
			args.splice(index != null && index >= 0 ? index : args.length, 0, callback);
			return this.apply(thisObj, args);
		}
	});
})(typeof exports !== 'undefined' ? exports : (Streamline.builtins = Streamline.builtins || {}));