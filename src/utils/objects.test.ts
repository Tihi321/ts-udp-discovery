import test from "ava";

import { copyObj, jsonParse, jsonStringify, lockNameProperty } from "./objects";
import { createServiceObject } from "./services";

const testDataObject = {
  key: "Value",
};

const getServiceObject = (
  name: string = "Test Object",
  interval: number = 5000,
  data: {
    [key: string]: any;
  } = testDataObject,
  available: boolean = false
) => createServiceObject(name, interval, data, available, undefined, undefined);

test("should return parsed JSON", t => {
  const result = jsonParse(JSON.stringify(testDataObject));
  t.deepEqual(result, testDataObject);
});

test("should return stringified JSON", t => {
  const result = jsonStringify(testDataObject);
  t.is(result, JSON.stringify(testDataObject));
});

test("should return new copied object", t => {
  const result = copyObj(testDataObject);
  t.deepEqual(result, testDataObject);
});

test("should modify object by locking it's name", t => {
  const service = getServiceObject();
  lockNameProperty(service.name, service);
  try {
    service.name = "Not allowed";
  } catch (error) {
    t.is(error.message, "Cannot assign to read only property 'name' of object '#<Object>'");
  }
  t.plan(1);
});
