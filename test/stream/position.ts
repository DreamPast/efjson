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
  for (const key in Object.getOwnPropertyNames(a)) {
    const aval = Reflect.get(a, key);
    const bval = Reflect.get(b, key);
    if (aval !== bval) return false;
  }
  return true;
};

console.assert(
  assertEq(getPosInfo("\r\n1"), { line: 2, column: 2, position: 3 })
);
console.assert(
  assertEq(getPosInfo("\r\r1"), { line: 3, column: 2, position: 3 })
);
console.assert(
  assertEq(getPosInfo("\r1"), { line: 2, column: 2, position: 3 })
);
console.assert(
  assertEq(getPosInfo("\n1"), { line: 2, column: 2, position: 3 })
);
