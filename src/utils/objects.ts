import { IServiceObject } from "src/types/services";

export const jsonParse = <T>(value: string): T | undefined => JSON.parse(value);
export const copyObj = <T>(value: T): T => ({ ...value });
export const jsonStringify = (value: object): string => JSON.stringify(value);

export const lockNameProperty = (name: string, service: IServiceObject): void => {
  Object.defineProperty(service, "name", {
    value: name,
    writable: false,
    enumerable: true,
    configurable: true,
  });
};
