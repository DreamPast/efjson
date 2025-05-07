import { createJsonStreamParser } from "../../efjson";

const getPosInfo = (s: string) => {
  const parser = createJsonStreamParser();
  parser.feed(s);
  return {
    line: parser.line,
    column: parser.column,
    position: parser.position,
  };
};
const assertEq = (a: object, b: object) => {
  for (const key in a) {
    const aval = Reflect.get(a, key);
    const bval = Reflect.get(b, key);
    if (aval !== bval) {
      console.error(`assertEq failed: ${key} ${aval} != ${bval}`);
      throw new Error("assertion failed");
    }
  }
  for (const key in b) {
    const aval = Reflect.get(a, key);
    const bval = Reflect.get(b, key);
    if (aval !== bval) {
      console.error(`assertEq failed: ${key} ${aval} != ${bval}`);
      throw new Error("assertion failed");
    }
  }
};

assertEq(getPosInfo("\r\n1"), { line: 2, column: 2, position: 3 });
assertEq(getPosInfo("\r\r1"), { line: 3, column: 2, position: 3 });
assertEq(getPosInfo("\r1"), { line: 2, column: 2, position: 2 });
assertEq(getPosInfo("\n1"), { line: 2, column: 2, position: 2});
