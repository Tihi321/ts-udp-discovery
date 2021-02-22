"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TSUDPDiscovery = void 0;
/* global NodeJS */
const dgram = __importStar(require("dgram"));
const events_1 = require("events");
const dgram_1 = require("../enums/dgram");
const events_2 = require("../enums/events");
const options_1 = require("../enums/options");
const is_1 = require("../utils/is");
const logger_1 = require("../utils/logger");
const objects_1 = require("../utils/objects");
const services_1 = require("../utils/services");
/**
 * Creates a Discovery object. The options object is optional. Supported
 * options are:
 *   - port - Set the port the service listens on for announcements default:
 *     44201
 *   - bindAddress - bind to an address
 *   - dgramType - Either 'udp4' or 'udp6', default: 'udp4'.
 *   - timeOutIntervalTime - duration of time between timeout checks in ms. Default 1000.
 * @param {TUDPServiceDiscoveryOptions} [options] An optional configuration object.
 * @constructor
 */
class TSUDPDiscovery {
    constructor(options) {
        this.reuseAddress = true;
        this.emit = (eventName, name, ...args) => {
            logger_1.Logger(`[TSUDPDiscovery emit] Sending message -Event Name ${eventName} -Name ${name} - Arguments ${JSON.stringify(args)}}`);
            return this.eventEmiter.emit(eventName, name, ...args);
        };
        this.on = (eventName, callback) => {
            logger_1.Logger(`[TSUDPDiscovery on] Subscribing to -Event Name ${eventName}`);
            return this.eventEmiter.on(eventName, callback);
        };
        /**
         * Handle timeouts on announcements. Deletes timed out entries from services.
         * @private
         */
        this.handleTimeOut = () => {
            // Also the object should have a services storage on it
            if (!this.services || !Object.keys(this.services).length) {
                logger_1.Logger("[TSUDPDiscovery handleTimeOut] Error: no services, exiting.");
                return;
            }
            const now = Date.now();
            Object.keys(this.services).forEach(name => {
                if (now - this.services[name].lastAnnTm > 2 * this.services[name].interval) {
                    this.emit(events_2.EEventNames.Unavailable, name, this.services[name], events_2.EEventReasons.TimedOut);
                }
            });
        };
        this.eventEmiter = new events_1.EventEmitter();
        this.services = {};
        this.port = options.port || options_1.EDefaultOptions.DEFAULT_UDP_PORT;
        this.bindAddress = options.bindAddress;
        this.dgramType = options.type || dgram_1.EDgramTypes.UDP4;
        this.timeOutIntervalTime = options.timeOutIntervalTime || options_1.EDefaultOptions.DEFAULT_TIMEOUT;
        this.socket = dgram.createSocket({
            type: this.dgramType,
            reuseAddr: this.reuseAddress,
        });
        this.socket.bind(this.port, this.bindAddress);
        this.timeOutId = setInterval(this.handleTimeOut, this.timeOutIntervalTime);
        // listen and listen for multicast packets
        this.socket.on(events_2.ESocketEvents.Listening, () => {
            this.socket.addMembership(options_1.EDefaultOptions.MULTICAST_ADDRESS);
        });
        this.socket.on(events_2.ESocketEvents.Message, (message, rinfo) => {
            if (message) {
                const obj = objects_1.jsonParse(message.toString());
                if (!obj) {
                    logger_1.Logger(`[UDP on message] Error: JSON parse failed on ${message.toString()}`);
                    return;
                }
                // the received message was either an event or an announcement
                if (obj.eventName) {
                    this.emit(events_2.EEventNames.MessageBus, obj.eventName, obj.data);
                }
                else {
                    this.handleAnnouncement(obj, rinfo);
                }
            }
        });
    }
    /**
     * Receives and processes announcements for a service.
     * @param {Object} ann The object describing the service.
     * @param {Object} [rinfo] An object with the sender's address information.
     * @return {Boolean} true, if successful false otherwise.
     * @private
     */
    handleAnnouncement(announcement, rinfo) {
        // ensure the ann is an object that is not empty
        if (!is_1.nonEmptyObj(announcement)) {
            logger_1.Logger(`[TSUDPDiscovery handleAnnouncement] Error: bad announcement ${announcement}`);
            return false;
        }
        // also, the ann obj needs a name
        if (!announcement.name) {
            logger_1.Logger("[TSUDPDiscovery handleAnnouncement] Error: name on announcement not present");
            return false;
        }
        // The entry exists, update it
        if (this.services && this.services[announcement.name]) {
            this.services[announcement.name].lastAnnTm = Date.now();
            return this.updateExisting(announcement.name, announcement.data, announcement.interval, announcement.available, rinfo);
        }
        // the entry is new, add it
        const announce = false;
        return this.addNewService(announcement.name, announcement.data, announcement.interval, announcement.available, announce, rinfo);
    }
    /**
     * update an existing service entry. Only works on services created locally.
     * @param {String} name The name of the service to announce. Required.
     * @param {Object} userData Any data the user desires, must be serializable to
     *      JSON. Required.
     * @param {Number} interval The duration between announcements. Default 3000 ms.
     * @param {Boolean} [available] OPtional parameter setting the state of the
     *      service. If not included, the default is true meaning available.
     * @param {TRsInfoObject} [rinfo] Optional parameter for remote address
     * @return {Boolean} true if successful, false otherwise.
     */
    updateExisting(name, userData, interval, available, rinfo) {
        // this is an existing entry
        const oldAvail = this.services[name].available;
        // update the lanst announcement time to now
        this.services[name].interval = interval;
        this.services[name].data = userData;
        // if there is an rinfo, copy it and place it on the service
        // we don't need the size parameter, though.
        if (rinfo && rinfo.address && !this.services[name].address) {
            this.services[name].address = rinfo.address;
        }
        // if the availability changed, emit an event
        if (available !== oldAvail) {
            this.services[name].available = available;
            const evName = available ? events_2.EEventNames.Available : events_2.EEventNames.Unavailable;
            this.emit(evName, name, this.services[name], events_2.EEventReasons.AvailabilityChange);
        }
        return true;
    }
    /**
     * Send new event when service first created
     * @param {String} name The name of the service to announce. Required.
     * @param {IServiceObject} service Service to announce.
     * @param {Boolean} [available] Optional parameter setting the state of the
     *      service. If not included, the default is true meaning available.
     */
    sendNewEvent(name, service, available) {
        const evName = available ? events_2.EEventNames.Available : events_2.EEventNames.Unavailable;
        this.emit(evName, name, service, events_2.EEventReasons.New);
    }
    /**
     * Send announcement of the event
     * @param {boolean} announce Should the service be continuouusly announced.
     * @param {IServiceObject} service Service to announce.
     * @return {NodeJS.Timeout | undefined} interval or undefined.
     */
    createIntervalAnnoumcement(interval, service) {
        const sendAnnouncement = () => {
            this.sendAnnounce(service);
        };
        return setInterval(sendAnnouncement, interval);
    }
    /**
     * Adds new announcements to the services object. Takes care of adding missing
     * values that have defaults, making the name property constant, and emitting
     * the correct events. If local is true, the service is local to this process.
     * @param {String} name The name of the service to announce. Required.
     * @param {Object} userData Any data the user desires, must be serializable to
     *      JSON. Required.
     * @param {Number} [interval] The duration between announcements. Default 3000
     *      ms, if not specified.
     * @param {Boolean} [available] OPtional parameter setting the state of the
     *      service. If not included, the default is true meaning available.
     * @param {Boolean} [announce] Optional parameter do we emit the net
     *      announcement. Default is treu.
     * @return {Boolean} true, if successful false otherwise.
     */
    addNewService(name, userData, interval, available = true, announce, rinfo) {
        logger_1.Logger(`[TSUDPDiscovery addNewService] -Name ${name} Starting`);
        if (!is_1.nonEmptyStr(name)) {
            logger_1.Logger(`[TSUDPDiscovery addNewService] -Name ${name} Error: invalid name`);
            return false;
        }
        if (!userData) {
            logger_1.Logger(`[TSUDPDiscovery addNewService] -Name ${name} Error: no user data`);
            return false;
        }
        const localInterval = interval > 0 ? interval : options_1.EDefaultOptions.DEFAULT_INTERVAL;
        if (this.services[name]) {
            logger_1.Logger(`[TSUDPDiscovery addNewService] -Name '${name} Error: Service allready exist`);
            return false;
        }
        const service = services_1.createServiceObject(name, localInterval, userData, available, announce, rinfo);
        objects_1.lockNameProperty(name, service);
        this.services[name] = service;
        this.sendNewEvent(name, this.services[name], available);
        if (announce) {
            this.services[name].intervalId = this.createIntervalAnnoumcement(localInterval, this.services[name]);
        }
        return true;
    }
    /**
     * Setup to emit announcements for a service over Udp multicast.
     * @param {IServiceObject} data The service to announce.
     * @return {Boolean} true, if successful false otherwise.
     * @private
     */
    sendAnnounce(data) {
        if (!is_1.nonEmptyObj(data)) {
            logger_1.Logger(`[TSUDPDiscovery sendAnnounce] Error: invalid data - ${data}`);
            return false;
        }
        const copy = objects_1.copyObj(data);
        copy.lastAnnTm = undefined;
        copy.intervalId = undefined;
        const str = objects_1.jsonStringify(copy);
        if (!str) {
            logger_1.Logger(`[TSUDPDiscovery sendAnnounce] Error: failed on stringify data: ${data}`);
            return false;
        }
        // emit the stringified buffer over multicast
        const buffer = JSON.stringify(Buffer.alloc(str.length, str));
        this.socket.emit(buffer, 0, buffer.length, this.port, options_1.EDefaultOptions.MULTICAST_ADDRESS);
        return true;
    }
    /**
     * Sets up announcements for a service.
     * @param {String} name The name of the service to announce. Required.
     * @param {Object} userData Any data the user desires, must be serializable to
     *      JSON.
     * @param {Number} [interval] The duration between announcements. If not
     *      specified, the default is 3000 ms.
     * @param {Boolean} [available] OPtional parameter setting the state of the
     *      service. If not included, the default is true meaning available.
     * @return {Boolean} true, if successful false otherwise.
     */
    announce(name, userData, interval, available = true) {
        if (!is_1.nonEmptyStr(name)) {
            logger_1.Logger(`[TSUDPDiscovery announce] -Name ${name} Error: invalid name`);
            return false;
        }
        if (!userData) {
            logger_1.Logger(`[TSUDPDiscovery announce] -Name ${name} Error: no user data`);
            return false;
        }
        // add defaults, if needed
        const localInterval = interval > 0 ? interval : options_1.EDefaultOptions.DEFAULT_INTERVAL;
        // make a copy of the userData object
        const userDataCopy = objects_1.copyObj(userData);
        if (!userDataCopy) {
            return false;
        }
        logger_1.Logger(`[TSUDPDiscovery announce] -Name ${name} user data: ${JSON.stringify(userDataCopy)}`);
        // attempt to add the announcement return result to user
        const announce = true;
        return this.addNewService(name, userDataCopy, localInterval, available, announce);
    }
    /**
     * Pause announcements for a service.
     * @param {String} name The name of the service to resume announcements.
     * @return {Boolean} true, if successful false otherwise.
     */
    pause(name) {
        logger_1.Logger(`[TSUDPDiscovery pause] -Name ${name} Starting`);
        // we have to have a name that is string and not empty
        if (!is_1.nonEmptyStr(name)) {
            logger_1.Logger(`[TSUDPDiscovery pause] -Name ${name} Error: invalid name`);
            return false;
        }
        if (!is_1.nonEmptyObj(this.services)) {
            logger_1.Logger(`[TSUDPDiscovery pause] -Name ${name} Error: There are no services to stop`);
            return false;
        }
        // the service has to be already known to stop announcing
        if (!this.services[name]) {
            logger_1.Logger(`[TSUDPDiscovery pause] -Name ${name} Error: no such service`);
            return false;
        }
        // if there is no task to do the announcing, quit
        if (!this.services[name].intervalId) {
            logger_1.Logger(`[TSUDPDiscovery pause] -Name ${name} Error: no entry for service`);
            return false;
        }
        // clear the interval and remove the intervalId property
        clearInterval(this.services[name].intervalId);
        this.services[name].intervalId = undefined;
        return true;
    }
    /**
     * Resumes announcements for a service.
     * @param {String} name The name of the service to resume announcements.
     * @param {Number} [interval] The duration in ms between announcements.
     *      Optional.
     * @return {Boolean} true, if successful false otherwise.
     */
    resume(name, interval) {
        // we need a name that is a string which is not empty
        if (!is_1.nonEmptyStr(name)) {
            logger_1.Logger(`[TSUDPDiscovery resume] -Name ${name} Error: invalid name`);
            return false;
        }
        // the service has to be known to resume
        if (!this.services || !this.services[name]) {
            logger_1.Logger(`[TSUDPDiscovery resume] -Name ${name} Error: no such service`);
            return false;
        }
        this.services[name].interval = interval > 0 ? interval : options_1.EDefaultOptions.DEFAULT_INTERVAL;
        // there can't be an interval task doing announcing to resume
        if (this.services[name].intervalId) {
            logger_1.Logger(`[TSUDPDiscovery resume] -Name ${name} Error: already announcing`);
            return false;
        }
        // create a function to emit the announcement using the closure to retain
        // the name and self
        const sendAnnouncement = () => {
            this.sendAnnounce(this.services[name]);
        };
        // create an interval task and store the id on the service entry
        this.services[name].intervalId = setInterval(sendAnnouncement, this.services[name].interval);
        return true;
    }
    /**
     * Allows for updating of service data.
     * @param {String} name The name of the service to update. Required.
     * @param {Object} userData Any data the user desires, must be serializable to
     *      JSON. Required.
     * @param {Number} [interval] The duration between announcements. Default 3000
     *      ms.
     * @param {Boolean} [available] OPtional parameter setting the state of the
     *      service. If not included, the default is true meaning available.
     * @return {Boolean} true, if successful false otherwise.
     */
    update(name, userData, interval, available = true) {
        // we have to have a name that is string and not empty
        if (!is_1.nonEmptyStr(name)) {
            logger_1.Logger(`[TSUDPDiscovery update] -Name ${name} Error: invalid name`);
            return false;
        }
        if (!userData) {
            logger_1.Logger(`[TSUDPDiscovery update] -Name ${name} Error: no user data`);
            return false;
        }
        const localInterval = interval > 0 ? interval : options_1.EDefaultOptions.DEFAULT_INTERVAL;
        // make a copy of the userData object
        const userDataCopy = objects_1.copyObj(userData);
        if (!userDataCopy) {
            return false;
        }
        // attempt to add the announcement return result to user
        return this.updateExisting(name, userDataCopy, localInterval, available);
    }
    /**
     * Retrieves service information by name.
     * @param {String} name The name of the service for which you want data.
     * @return {Object|Boolean} The object describing the srevice if available, and
     *     false otherwise.
     */
    getData(name) {
        // handle conditions for which there is no answer
        if (!is_1.nonEmptyStr(name)) {
            return false;
        }
        if (!this.services || !this.services[name]) {
            return false;
        }
        // Developers just want annoucement data, emit that.
        return this.services[name].data;
    }
    /**
     * Send an event to all discovered services.
     * @param {String} eventName The name of the event.
     * @param {Object} [userData] User data sent along with the event. Optional.
     * @return {Boolean} true, if successful false otherwise.
     */
    sendEvent(eventName, userData) {
        if (!is_1.nonEmptyStr(eventName)) {
            logger_1.Logger(`[TSUDPDiscovery update] -Event Name ${eventName} Error: invalid event name`);
            return false;
        }
        return this.sendEventToAddress(options_1.EDefaultOptions.MULTICAST_ADDRESS, eventName, userData);
    }
    /**
     * Send an event to a service, an array of services, or services matching a
     * query.
     * @param {String|Array|Function} destinationServices The service name, an array of services
     *      or a query to select services.
     * @param {String} eventName The name of the event.
     * @param {Object} [data] User data sent along with the event. Optional.
     * @return {Boolean} true on success, false otherwise.
     */
    sendEventTo(destinationServices, eventName, data) {
        if (!is_1.nonEmptyStr(destinationServices) &&
            !is_1.nonEmptyArray(destinationServices) &&
            !is_1.isFunction(destinationServices)) {
            logger_1.Logger(`[TSUDPDiscovery sendEventTo] -Event Name ${eventName} Error: invalid destination service`);
            return false;
        }
        if (!is_1.nonEmptyStr(eventName)) {
            logger_1.Logger(`[TSUDPDiscovery sendEventTo] -Event Name ${eventName} Error: invalid event name`);
            return false;
        }
        // handle the case where dest is a service name
        if (is_1.nonEmptyStr(destinationServices)) {
            this.sendEventToService(destinationServices, eventName, data);
        }
        else if (is_1.nonEmptyArray(destinationServices)) {
            const queryArray = destinationServices;
            queryArray.forEach(query => this.sendEventToService(query, eventName, data));
        }
        else if (is_1.isFunction(destinationServices)) {
            const queryFunc = destinationServices;
            Object.keys(this.services).forEach(name => {
                if (queryFunc(this.services[name]) === true) {
                    this.sendEventToService(this.services[name].name, eventName, data);
                }
            });
        }
        return true;
    }
    /**
     * Send event to either the local process or remote process.
     * @param {String} name The name of the service to receive the message.
     * @param {String} eventName The name of the event.
     * @param {Object} [data] Optional user data to emit with message.
     * @return {Boolean} true on success, false otherwise.
     * @private
     */
    sendEventToService(name, eventName, data) {
        if (!is_1.nonEmptyStr(name)) {
            logger_1.Logger(`[TSUDPDiscovery sendEventToService] -Name ${name} Error: invalid name`);
            return false;
        }
        if (!this.services[name]) {
            logger_1.Logger(`[TSUDPDiscovery sendEventToService] -Name ${name} Error: no such service`);
            return false;
        }
        if (!is_1.nonEmptyStr(eventName)) {
            logger_1.Logger(`[TSUDPDiscovery sendEventToService] -Name ${name} Error: invalid event name`);
            return false;
        }
        if (this.services[name].local) {
            this.emit(events_2.EEventNames.MessageBus, eventName, data);
        }
        else if (this.services[name].address) {
            this.sendEventToAddress(this.services[name].address, eventName, data);
        }
        return true;
    }
    /**
     * Send event to either the local process or remote process.
     * @param {String} address The address of the service to receive the message.
     * @param {String} eventName The event name to emit.
     * @param {Object} [data] Optional user data to emit with message.
     * @return {Boolean} true on success, false otherwise.
     * @private
     */
    sendEventToAddress(address, eventName, data) {
        if (!is_1.nonEmptyStr(eventName)) {
            logger_1.Logger(`[TSUDPDiscovery sendEventToAddress] -Event Name ${eventName} Error: invalid event name`);
            return false;
        }
        if (!is_1.nonEmptyStr(address)) {
            logger_1.Logger(`[TSUDPDiscovery sendEventToAddress] -Event Name ${eventName} Error: invalid address`);
            return false;
        }
        const obj = {
            eventName,
            data,
        };
        // convert data to JSON string
        const str = objects_1.jsonStringify(obj);
        if (!str) {
            logger_1.Logger(`[TSUDPDiscovery sendEventToAddress] -Event Name ${eventName} Error: JSON stringify data paramenter`);
            return false;
        }
        const buffer = JSON.stringify(Buffer.alloc(str.length, str));
        this.socket.emit(buffer, 0, buffer.length, this.port, address);
        return true;
    }
}
exports.TSUDPDiscovery = TSUDPDiscovery;
//# sourceMappingURL=TSUDPDiscovery.js.map