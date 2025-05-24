import { assertEq, checkNormal } from "../_util";
import { createJsonNormalParser, JSON5_OPTION, jsonNormalEmit, jsonStreamParse } from "../../src/index";

describe("other", () => {
  test("position", () => {
    const getPosInfo = (s: string) => {
      const parser = createJsonNormalParser();
      parser.feed(s);
      return {
        line: parser.line,
        column: parser.column,
        position: parser.position,
      };
    };

    assertEq(getPosInfo("\r\n1"), { line: 2, column: 2, position: 3 });
    assertEq(getPosInfo("\r\r1"), { line: 3, column: 2, position: 3 });
    assertEq(getPosInfo("\r1"), { line: 2, column: 2, position: 2 });
    assertEq(getPosInfo("\n1"), { line: 2, column: 2, position: 2 });
  });

  test("comment", () => {
    checkNormal("/**/1", 1, JSON5_OPTION);
    checkNormal("/* */1", 1, JSON5_OPTION);
    checkNormal("/* * */1", 1, JSON5_OPTION);
    checkNormal("/***/1", 1, JSON5_OPTION);
  });

  test("special", () => {
    checkNormal("\0", undefined);
  });

  test("emit", () => {
    assertEq(jsonNormalEmit(jsonStreamParse("1234")), 1234);
  });
});
