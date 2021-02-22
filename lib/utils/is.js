"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFunction = exports.nonEmptyArray = exports.nonEmptyStr = exports.nonEmptyObj = void 0;
const nonEmptyObj = (value) => Object.keys(value).length > 0;
exports.nonEmptyObj = nonEmptyObj;
const nonEmptyStr = (value) => typeof value === "string" && value !== "";
exports.nonEmptyStr = nonEmptyStr;
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
exports.nonEmptyArray = nonEmptyArray;
const isFunction = (value) => !!(value && value.constructor && value.call && value.apply);
exports.isFunction = isFunction;
//# sourceMappingURL=is.js.map