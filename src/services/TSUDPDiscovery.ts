/* global NodeJS */
import * as dgram from "dgram";
import { EventEmitter } from "events";

import { EDgramTypes } from "../enums/dgram";
import { EEventNames, EEventReasons, ESocketEvents } from "../enums/events";
import { EDefaultOptions } from "../enums/options";
import { TAnnouncementObject, TRsInfoObject } from "../types/messages";
import {
  IServiceAnnouncement,
  IServiceObject,
  TUDPServiceDiscoveryOptions,
} from "../types/services";
import { ITSUDPDiscovery } from "../types/ts-discovery";
import { isLibrary } from "../utils/is";
import { Logger } from "../utils/logger";
import { lockNameProperty, objToJson } from "../utils/objects";
import { createServiceObject } from "../utils/services";

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
export class TSUDPDiscovery implements ITSUDPDiscovery {
  private reuseAddress: boolean = true;
  private eventEmiter: EventEmitter;
  private timeOutIntervalTime: number;
  public services: { [key: string]: IServiceObject };
  dgramType;
  socket;
  port;
  bindAddress;
  timeOutId;

  constructor(options: TUDPServiceDiscoveryOptions) {
    this.eventEmiter = new EventEmitter();
    this.services = {};
    this.port = options.port || EDefaultOptions.DEFAULT_UDP_PORT;
    this.bindAddress = options.bindAddress;
    this.dgramType = options.type || EDgramTypes.UDP4;
    this.timeOutIntervalTime = options.timeOutIntervalTime || EDefaultOptions.DEFAULT_TIMEOUT;
    this.socket = dgram.createSocket({
      type: this.dgramType,
      reuseAddr: this.reuseAddress,
    });

    this.socket.bind(this.port, this.bindAddress);

    this.timeOutId = setInterval(this.handleTimeOut, this.timeOutIntervalTime);

    // listen and listen for multicast packets
    this.socket.on(ESocketEvents.Listening, () => {
      this.socket.addMembership(EDefaultOptions.MULTICAST_ADDRESS);
    });

    this.socket.on(ESocketEvents.Message, (message, rinfo) => {
      if (message) {
        const obj = <TAnnouncementObject>objToJson.jsonParse(message.toString());

        if (!obj) {
          Logger(`[UDP on message] Error: JSON parse failed on ${message.toString()}`);

          return;
        }

        // the received message was either an event or an announcement
        if (obj.eventName) {
          this.emit(EEventNames.MessageBus, obj.eventName, obj.data);
        } else {
          this.handleAnnouncement(obj, rinfo);
        }
      }
    });
  }

  emit = (eventName: string | EEventNames, name: string, ...args: any[]): boolean => {
    Logger(
      `[TSUDPDiscovery emit] Sending message -Event Name ${eventName} -Name ${name} - Arguments ${JSON.stringify(
        args
      )}}`
    );

    return this.eventEmiter.emit(eventName, name, ...args);
  };

  on = (eventName: string, callback: (...args: any[]) => void): EventEmitter => {
    Logger(`[TSUDPDiscovery on] Subscribing to -Event Name ${eventName}`);

    return this.eventEmiter.on(eventName, callback);
  };

  /**
   * Receives and processes announcements for a service.
   * @param {Object} ann The object describing the service.
   * @param {Object} [rinfo] An object with the sender's address information.
   * @return {Boolean} true, if successful false otherwise.
   * @private
   */
  handleAnnouncement(announcement: TAnnouncementObject, rinfo: TRsInfoObject): boolean {
    // ensure the ann is an object that is not empty
    if (!isLibrary.nonEmptyObj(announcement)) {
      Logger(`[TSUDPDiscovery handleAnnouncement] Error: bad announcement ${announcement}`);

      return false;
    }

    // also, the ann obj needs a name
    if (!announcement.name) {
      Logger("[TSUDPDiscovery handleAnnouncement] Error: name on announcement not present");

      return false;
    }

    // The entry exists, update it
    if (this.services && this.services[announcement.name]) {
      this.services[announcement.name].lastAnnTm = Date.now();

      return this.updateExisting(
        announcement.name,
        announcement.data,
        announcement.interval,
        announcement.available,
        rinfo
      );
    }

    // the entry is new, add it
    const announce = false;

    return this.addNewService(
      announcement.name,
      announcement.data,
      announcement.interval,
      announcement.available,
      announce,
      rinfo
    );
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
  updateExisting(
    name: string,
    userData: { [key: string]: any },
    interval: number,
    available: boolean,
    rinfo?: TRsInfoObject
  ): boolean {
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
      const evName = available ? EEventNames.Available : EEventNames.Unavailable;
      this.emit(evName, name, this.services[name], EEventReasons.AvailabilityChange);
    }

    return true;
  }

  /**
   * Handle timeouts on announcements. Deletes timed out entries from services.
   * @private
   */
  handleTimeOut = () => {
    // Also the object should have a services storage on it
    if (!this.services || !Object.keys(this.services).length) {
      Logger("[TSUDPDiscovery handleTimeOut] Error: no services, exiting.");

      return;
    }

    const now = Date.now();

    Object.keys(this.services).forEach(name => {
      if (now - this.services[name].lastAnnTm > 2 * this.services[name].interval) {
        this.emit(EEventNames.Unavailable, name, this.services[name], EEventReasons.TimedOut);
      }
    });
  };

  /**
   * Send new event when service first created
   * @param {String} name The name of the service to announce. Required.
   * @param {IServiceObject} service Service to announce.
   * @param {Boolean} [available] Optional parameter setting the state of the
   *      service. If not included, the default is true meaning available.
   */
  sendNewEvent(name: string, service: IServiceObject, available?: boolean) {
    const evName = available ? EEventNames.Available : EEventNames.Unavailable;
    this.emit(evName, name, service, EEventReasons.New);
  }

  /**
   * Send announcement of the event
   * @param {boolean} announce Should the service be continuouusly announced.
   * @param {IServiceObject} service Service to announce.
   * @return {NodeJS.Timeout | undefined} interval or undefined.
   */
  createIntervalAnnoumcement(interval: number, service: IServiceObject): NodeJS.Timeout {
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
  addNewService(
    name: string,
    userData: { [key: string]: any },
    interval: number,
    available: boolean = true,
    announce?: boolean,
    rinfo?: TRsInfoObject
  ): boolean {
    Logger(`[TSUDPDiscovery addNewService] -Name ${name} Starting`);

    if (!isLibrary.nonEmptyStr(name)) {
      Logger(`[TSUDPDiscovery addNewService] -Name ${name} Error: invalid name`);

      return false;
    }

    if (!userData) {
      Logger(`[TSUDPDiscovery addNewService] -Name ${name} Error: no user data`);

      return false;
    }

    const localInterval = interval > 0 ? interval : EDefaultOptions.DEFAULT_INTERVAL;

    if (this.services[name]) {
      Logger(`[TSUDPDiscovery addNewService] -Name '${name} Error: Service allready exist`);

      return false;
    }

    const service = createServiceObject(name, localInterval, userData, available, announce, rinfo);

    lockNameProperty(name, service);
    this.services[name] = service;

    this.sendNewEvent(name, this.services[name], available);

    if (announce) {
      this.services[name].intervalId = this.createIntervalAnnoumcement(
        localInterval,
        this.services[name]
      );
    }

    return true;
  }

  /**
   * Setup to emit announcements for a service over Udp multicast.
   * @param {IServiceObject} data The service to announce.
   * @return {Boolean} true, if successful false otherwise.
   * @private
   */
  sendAnnounce(data: IServiceObject): boolean {
    if (!isLibrary.nonEmptyObj(data)) {
      Logger(`[TSUDPDiscovery sendAnnounce] Error: invalid data - ${data}`);

      return false;
    }

    const copy = <IServiceAnnouncement>objToJson.copyObj(data);
    copy.lastAnnTm = undefined;
    copy.intervalId = undefined;

    const str = objToJson.jsonStringify(copy);

    if (!str) {
      Logger(`[TSUDPDiscovery sendAnnounce] Error: failed on stringify data: ${data}`);

      return false;
    }

    // emit the stringified buffer over multicast
    const buffer = JSON.stringify(Buffer.alloc(str.length, str));
    this.socket.emit(buffer, 0, buffer.length, this.port, EDefaultOptions.MULTICAST_ADDRESS);

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
  announce(
    name: string,
    userData: { [key: string]: any },
    interval: number,
    available: boolean = true
  ): boolean {
    if (!isLibrary.nonEmptyStr(name)) {
      Logger(`[TSUDPDiscovery announce] -Name ${name} Error: invalid name`);

      return false;
    }

    if (!userData) {
      Logger(`[TSUDPDiscovery announce] -Name ${name} Error: no user data`);

      return false;
    }

    // add defaults, if needed
    const localInterval = interval > 0 ? interval : EDefaultOptions.DEFAULT_INTERVAL;

    // make a copy of the userData object
    const userDataCopy = <object>objToJson.copyObj(userData);

    if (!userDataCopy) {
      return false;
    }

    Logger(`[TSUDPDiscovery announce] -Name ${name} user data: ${JSON.stringify(userDataCopy)}`);

    // attempt to add the announcement return result to user
    const announce = true;

    return this.addNewService(name, userDataCopy, localInterval, available, announce);
  }

  /**
   * Pause announcements for a service.
   * @param {String} name The name of the service to resume announcements.
   * @return {Boolean} true, if successful false otherwise.
   */
  pause(name: string): boolean {
    Logger(`[TSUDPDiscovery pause] -Name ${name} Starting`);

    // we have to have a name that is string and not empty
    if (!isLibrary.nonEmptyStr(name)) {
      Logger(`[TSUDPDiscovery pause] -Name ${name} Error: invalid name`);

      return false;
    }

    if (!isLibrary.nonEmptyObj(this.services)) {
      Logger(`[TSUDPDiscovery pause] -Name ${name} Error: There are no services to stop`);

      return false;
    }

    // the service has to be already known to stop announcing
    if (!this.services[name]) {
      Logger(`[TSUDPDiscovery pause] -Name ${name} Error: no such service`);

      return false;
    }

    // if there is no task to do the announcing, quit
    if (!this.services[name].intervalId) {
      Logger(`[TSUDPDiscovery pause] -Name ${name} Error: no entry for service`);

      return false;
    }

    // clear the interval and remove the intervalId property
    clearInterval(this.services[name].intervalId as NodeJS.Timeout);
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
  resume(name: string, interval: number): boolean {
    // we need a name that is a string which is not empty
    if (!isLibrary.nonEmptyStr(name)) {
      Logger(`[TSUDPDiscovery resume] -Name ${name} Error: invalid name`);

      return false;
    }

    // the service has to be known to resume
    if (!this.services || !this.services[name]) {
      Logger(`[TSUDPDiscovery resume] -Name ${name} Error: no such service`);

      return false;
    }

    this.services[name].interval = interval > 0 ? interval : EDefaultOptions.DEFAULT_INTERVAL;

    // there can't be an interval task doing announcing to resume
    if (this.services[name].intervalId) {
      Logger(`[TSUDPDiscovery resume] -Name ${name} Error: already announcing`);

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
  update(
    name: string,
    userData: { [key: string]: any },
    interval: number,
    available: boolean = true
  ): boolean {
    // we have to have a name that is string and not empty
    if (!isLibrary.nonEmptyStr(name)) {
      Logger(`[TSUDPDiscovery update] -Name ${name} Error: invalid name`);

      return false;
    }

    if (!userData) {
      Logger(`[TSUDPDiscovery update] -Name ${name} Error: no user data`);

      return false;
    }

    const localInterval = interval > 0 ? interval : EDefaultOptions.DEFAULT_INTERVAL;

    // make a copy of the userData object
    const userDataCopy = objToJson.copyObj(userData);

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
  getData(name: string): object | boolean {
    // handle conditions for which there is no answer
    if (!isLibrary.nonEmptyStr(name)) {
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
  sendEvent(eventName: string, userData: { [key: string]: any }): boolean {
    if (!isLibrary.nonEmptyStr(eventName)) {
      Logger(`[TSUDPDiscovery update] -Event Name ${eventName} Error: invalid event name`);

      return false;
    }

    return this.sendEventToAddress(EDefaultOptions.MULTICAST_ADDRESS, eventName, userData);
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
  sendEventTo(
    destinationServices: string | Array<string> | Function,
    eventName: string,
    data?: object
  ): boolean {
    if (
      !isLibrary.nonEmptyStr(destinationServices) &&
      !isLibrary.nonEmptyArray(destinationServices) &&
      !isLibrary.isFunction(destinationServices)
    ) {
      Logger(
        `[TSUDPDiscovery sendEventTo] -Event Name ${eventName} Error: invalid destination service`
      );

      return false;
    }

    if (!isLibrary.nonEmptyStr(eventName)) {
      Logger(`[TSUDPDiscovery sendEventTo] -Event Name ${eventName} Error: invalid event name`);

      return false;
    }

    // handle the case where dest is a service name
    if (isLibrary.nonEmptyStr(destinationServices)) {
      this.sendEventToService(destinationServices as string, eventName, data);
    } else if (isLibrary.nonEmptyArray(destinationServices)) {
      const queryArray = destinationServices as Array<string>;
      queryArray.forEach(query => this.sendEventToService(query, eventName, data));
    } else if (isLibrary.isFunction(destinationServices)) {
      const queryFunc = destinationServices as Function;
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
  sendEventToService(name: string, eventName: string, data?: object): boolean {
    if (!isLibrary.nonEmptyStr(name)) {
      Logger(`[TSUDPDiscovery sendEventToService] -Name ${name} Error: invalid name`);

      return false;
    }

    if (!this.services[name]) {
      Logger(`[TSUDPDiscovery sendEventToService] -Name ${name} Error: no such service`);

      return false;
    }

    if (!isLibrary.nonEmptyStr(eventName)) {
      Logger(`[TSUDPDiscovery sendEventToService] -Name ${name} Error: invalid event name`);

      return false;
    }

    if (this.services[name].local) {
      this.emit(EEventNames.MessageBus, eventName, data);
    } else if (this.services[name].address) {
      this.sendEventToAddress(this.services[name].address as string, eventName, data);
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
  sendEventToAddress(address: string, eventName: string, data?: object): boolean {
    if (!isLibrary.nonEmptyStr(eventName)) {
      Logger(
        `[TSUDPDiscovery sendEventToAddress] -Event Name ${eventName} Error: invalid event name`
      );

      return false;
    }

    if (!isLibrary.nonEmptyStr(address)) {
      Logger(`[TSUDPDiscovery sendEventToAddress] -Event Name ${eventName} Error: invalid address`);

      return false;
    }

    const obj = {
      eventName,
      data,
    };

    // convert data to JSON string
    const str = objToJson.jsonStringify(obj);

    if (!str) {
      Logger(
        `[TSUDPDiscovery sendEventToAddress] -Event Name ${eventName} Error: JSON stringify data paramenter`
      );

      return false;
    }

    const buffer = JSON.stringify(Buffer.alloc(str.length, str));
    this.socket.emit(buffer, 0, buffer.length, this.port, address);

    return true;
  }
}
