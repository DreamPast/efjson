import { createJsonStreamParser } from "../../efjson";
import { assertEq } from "../util";

const getPosInfo = (s: string) => {
  const parser = createJsonStreamParser();
  parser.feed(s);
  return {
    line: parser.line,
    column: parser.column,
    position: parser.position,
  };
};
const assertObjectEq = (a: object, b: object) => {
  for (const key in a) {
    const aval = Reflect.get(a, key);
    const bval = Reflect.get(b, key);
    if (aval !== bval) assertEq(aval, bval, key);
  }
  for (const key in b) {
    const aval = Reflect.get(a, key);
    const bval = Reflect.get(b, key);
    if (aval !== bval) assertEq(aval, bval, key);
  }
};

assertObjectEq(getPosInfo("\r\n1"), { line: 2, column: 2, position: 3 });
assertObjectEq(getPosInfo("\r\r1"), { line: 3, column: 2, position: 3 });
assertObjectEq(getPosInfo("\r1"), { line: 2, column: 2, position: 2 });
assertObjectEq(getPosInfo("\n1"), { line: 2, column: 2, position: 2 });
