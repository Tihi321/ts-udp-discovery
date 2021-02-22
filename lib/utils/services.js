"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServiceObject = void 0;
const createServiceObject = (name, interval, data, available, local, rinfo) => ({
    name,
    interval,
    data,
    available,
    local,
    address: rinfo && rinfo.address ? rinfo.address : undefined,
    lastAnnTm: Date.now(),
    intervalId: undefined,
});
exports.createServiceObject = createServiceObject;
//# sourceMappingURL=services.js.map