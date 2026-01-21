import { assertEq, checkNormal } from "../_util";
import { createJsonNormalParser, JSON5_OPTION, jsonNormalEmit, Stage, jsonStreamParse } from "../../src/index";

describe("other", () => {
  test("position", () => {
    const getPosInfo = (s: string) => {
      const parser = createJsonNormalParser({ ...JSON5_OPTION, acceptEmptyValue: true });
      parser.feed(s);
      parser.end();
      return {
        line: parser.line,
        column: parser.column,
        position: parser.position,
      };
    };

    assertEq(getPosInfo("\r\n12"), { line: 1, column: 2, position: 4 });
    assertEq(getPosInfo("\r\r12"), { line: 2, column: 2, position: 4 });
    assertEq(getPosInfo("\n\n12"), { line: 2, column: 2, position: 4 });
    assertEq(getPosInfo("\r12"), { line: 1, column: 2, position: 3 });
    assertEq(getPosInfo("\n12"), { line: 1, column: 2, position: 3 });

    assertEq(getPosInfo("//"), { line: 0, column: 2, position: 2 });
    assertEq(getPosInfo("/**/"), { line: 0, column: 4, position: 4 });

    assertEq(getPosInfo("\r"), { line: 1, column: 0, position: 1 });
    assertEq(getPosInfo("\n"), { line: 1, column: 0, position: 1 });
    assertEq(getPosInfo("\r\n"), { line: 1, column: 0, position: 2 });
    assertEq(getPosInfo("\r\r"), { line: 2, column: 0, position: 2 });
    assertEq(getPosInfo("\n\n"), { line: 2, column: 0, position: 2 });
  });

  test("stage", () => {
    const parser = createJsonNormalParser();
    assertEq(parser.stage, Stage.NOT_STARTED);
    assertEq(parser.get(), undefined);
    parser.feed(" ");
    assertEq(parser.stage, Stage.NOT_STARTED);
    assertEq(parser.get(), undefined);
    for (const c of '{"a":[ 1 , 2 ], "b"  : null') {
      parser.feed(c);
      assertEq(parser.stage, Stage.PARSING);
      assertEq(parser.get(), undefined);
    }
    for (const c of "} \0") {
      parser.feed(c);
      assertEq(parser.stage, Stage.ENDED);
      assertEq(parser.get(), { a: [1, 2], b: null });
    }
  });

  test("comment", () => {
    checkNormal("/**/1", 1, JSON5_OPTION);
    checkNormal("/* */1", 1, JSON5_OPTION);
    checkNormal("/* * */1", 1, JSON5_OPTION);
    checkNormal("/***/1", 1, JSON5_OPTION);

    checkNormal("/* *", undefined, JSON5_OPTION);
  });

  test("content_after_eof", () => {
    checkNormal("1\x001", undefined);
  });

  test("special", () => {
    checkNormal("\0", undefined);
    checkNormal(",", undefined);
  });

  test("emit", () => {
    assertEq(jsonNormalEmit(jsonStreamParse("1234")), 1234);
  });
});
