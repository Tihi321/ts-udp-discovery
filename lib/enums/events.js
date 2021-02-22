"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EEventReasons = exports.ESocketEvents = exports.EEventNames = void 0;
var EEventNames;
(function (EEventNames) {
    EEventNames["MessageBus"] = "MessageBus";
    EEventNames["Available"] = "available";
    EEventNames["Unavailable"] = "unavailable";
})(EEventNames = exports.EEventNames || (exports.EEventNames = {}));
var ESocketEvents;
(function (ESocketEvents) {
    ESocketEvents["Listening"] = "listening";
    ESocketEvents["Message"] = "message";
})(ESocketEvents = exports.ESocketEvents || (exports.ESocketEvents = {}));
var EEventReasons;
(function (EEventReasons) {
    EEventReasons["New"] = "new";
    EEventReasons["TimedOut"] = "timedOut";
    EEventReasons["AvailabilityChange"] = "availabilityChange";
})(EEventReasons = exports.EEventReasons || (exports.EEventReasons = {}));
//# sourceMappingURL=events.js.map