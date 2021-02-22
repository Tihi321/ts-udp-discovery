"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lockNameProperty = exports.jsonStringify = exports.copyObj = exports.jsonParse = void 0;
const jsonParse = (value) => JSON.parse(value);
exports.jsonParse = jsonParse;
const copyObj = (value) => ({ ...value });
exports.copyObj = copyObj;
const jsonStringify = (value) => JSON.stringify(value);
exports.jsonStringify = jsonStringify;
const lockNameProperty = (name, service) => {
    Object.defineProperty(service, "name", {
        value: name,
        writable: false,
        enumerable: true,
        configurable: true,
    });
};
exports.lockNameProperty = lockNameProperty;
//# sourceMappingURL=objects.js.map