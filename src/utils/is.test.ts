import test from "ava";

import { isFunction, nonEmptyArray, nonEmptyObj, nonEmptyStr } from "./is";

test("should return true on not empty string provided", t => {
  const result = nonEmptyStr("Not Empty string");
  t.is(result, true);
});

test("should return false as empty string provided", async t => {
  const result = nonEmptyStr("");
  t.is(result, false);
});

test("should return true on not empty array provided", t => {
  const result = nonEmptyArray(["Not Empty array"]);
  t.is(result, true);
});

test("should return false as empty array provided", async t => {
  const result = nonEmptyArray([]);
  t.is(result, false);
});

test("should return true on not empty object provided", t => {
  const result = nonEmptyObj({ key: "Value" });
  t.is(result, true);
});

test("should return false as empty object provided", async t => {
  const result = nonEmptyObj({});
  t.is(result, false);
});

test("should return true as function provided", t => {
  const result = isFunction(() => {
    t.pass();
  });
  t.is(result, true);
});

test("should return false as function provided not provided", async t => {
  const result = isFunction({});
  t.is(result, false);
});
