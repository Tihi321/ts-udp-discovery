/// <reference types="node" />
import { EDgramTypes } from "../enums/dgram";
export declare type TUDPServiceDiscoveryOptions = {
    port: number;
    timeOutIntervalTime: number;
    type?: EDgramTypes;
    bindAddress?: string;
};
export interface IService {
    name: string;
    interval: number;
    data: {
        [key: string]: any;
    };
    available: boolean;
    address?: string;
    local?: boolean;
}
export interface IServiceObject extends IService {
    lastAnnTm: number;
    intervalId: NodeJS.Timeout | undefined;
}
export interface IServiceAnnouncement extends IService {
    lastAnnTm?: number;
    intervalId?: NodeJS.Timeout;
}
//# sourceMappingURL=services.d.ts.map