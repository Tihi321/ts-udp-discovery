export const nonEmptyObj = (value: object) => Object.keys(value).length > 0;
export const nonEmptyStr = (value: any): boolean => typeof value === "string" && value !== "";
export const nonEmptyArray = (value: any): boolean => Array.isArray(value) && value.length > 0;
export const isFunction = (value: any): boolean =>
  !!(value && value.constructor && value.call && value.apply);
