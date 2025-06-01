import {
  createJsonEventParser,
  JSON5_OPTION,
  JsonDefaultEventReceiver,
  jsonEventEmit,
  jsonEventParse,
  JsonEventReceiver,
  JsonOption,
  jsonStreamParse,
} from "../src/index";
import { assertEq, assertUnreachable, checkEvent } from "./_util";

describe("event", () => {
  test("any", () => {
    {
      let saved: any;
      const receiver: JsonEventReceiver = {
        string: {
          save: (value: string) => {
            saved = +value;
          },
        },
        number: {
          save: (value: number) => {
            saved = "" + value;
          },
        },
      };

      saved = undefined;
      jsonEventParse("12", receiver);
      assertEq(typeof saved, "string");

      saved = undefined;
      jsonEventParse('"12"', receiver);
      assertEq(typeof saved, "number");
    }

    {
      let saved: any;
      const receiver: JsonEventReceiver = {
        string: {
          save: (value: string) => {
            saved = value;
          },
        },
        number: {
          save: (value: number) => {
            saved = value;
          },
        },
      };

      saved = undefined;
      jsonEventParse("12", receiver);
      assertEq(typeof saved, "number");

      saved = undefined;
      jsonEventParse('"12"', receiver);
      assertEq(typeof saved, "string");
    }
  });

  test("json5", () => {
    const str = `{
  // comments
  unquoted: "I am unquoted",
  \\u0032: "I am also unquoted",
  \u0915\u094d\u200C: "this is a identifier",
  "comments" /* comment here */: /* or here */ "a" /* and here */, /**/
  'singleQuotes\\u1234': 'I can use "double quotes" here',
  "lineBreaks": "Look, Mom! \\
No \\\\n's! \\x40",
  "hexadecimal": 0xdecaf,
  "leadingDecimalPoint": .8675309, "andTrailing": 8675309.,
  "positiveSign": +1,
  "trailingComma": 'in objects', "andIn": ['arrays',],
  "dict": { string: 'string', number: 12, boolean: true, null: null, array: [1,], object: {"a":1} },
  dict2: { string: 'string', number: 12, boolean: true, null: null, array: [1,], object: {"a":1} },
  "backwardsCompatible": "with JSON",
  "nan": NaN,
  "infinity": \u3000 [Infinity, -Infinity],
}
`;

    jsonEventParse(
      str,
      {
        object: {
          subreceiver: (key) => {
            if (["hexadecimal", "leadingDecimalPoint", "andTrailing", "positiveSign", "nan"].includes(key)) {
              return { number: {} };
            } else if (["andIn", "infinity"].includes(key)) {
              return {
                array: {
                  subreceiver: () => ({ [key === "andIn" ? "string" : "number"]: {} }),
                  save() {},
                },
              };
            } else if (key === "dict" || key === "dict2") {
              return {
                object: {
                  subreceiver: (k) => ({ [k as any]: {} }),
                  save() {},
                },
              };
            } else {
              return { ...JsonDefaultEventReceiver, save() {} };
            }
          },
        },
      },
      JSON5_OPTION,
    );

    jsonEventEmit(jsonStreamParse("{a:1,b:2,\\u0032:3,}", JSON5_OPTION), {
      object: {
        keyReceiver: JsonDefaultEventReceiver,
      },
    });
  });

  test("number", () => {
    {
      const option: JsonOption = {
        acceptOctalInteger: true,
        acceptBinaryInteger: true,
        acceptHexadecimalInteger: true,
      };
      {
        let done = false;
        jsonEventParse(
          "0x12",
          {
            number: {
              save(num) {
                done = true;
                assertEq(num, 0x12);
              },
            },
          },
          option,
        );
        assertEq(done, true);
      }
      {
        let done = false;
        jsonEventParse(
          "0o12",
          {
            number: {
              save(num) {
                done = true;
                assertEq(num, 0o12);
              },
            },
          },
          option,
        );
        assertEq(done, true);
      }
      {
        let done = false;
        jsonEventParse(
          "0b10110",
          {
            number: {
              save(num) {
                done = true;
                assertEq(num, 0b10110);
              },
            },
          },
          option,
        );
        assertEq(done, true);
      }
    }
  });

  test("mismatch", () => {
    const list: [string, string[]][] = [
      ["null", ["null"]],
      ["1", ["integer", "number"]],
      ["+1", ["integer", "number"]],
      ["-1", ["integer", "number"]],
      ["-0", ["number"]],
      ["1.2", ["number"]],
      ["+1.2", ["number"]],
      ["-1.2", ["number"]],
      ["true", ["boolean"]],
      ["false", ["boolean"]],
      ['"A"', ["string"]],
      ["[]", ["array"]],
      ["{}", ["object"]],
    ];
    for (let i = 0; i < list.length; i++)
      for (let j = 0; j < list.length; j++) {
        checkEvent(list[i][0], { [list[j][1][0]]: { save() {} } }, !list[i][1].includes(list[j][1][0]), JSON5_OPTION);
      }
  });

  test("position", () => {
    const getPosInfo = (s: string) => {
      const parser = createJsonEventParser({ number: {} });
      parser.feed(s);
      parser.end();
      return {
        line: parser.line,
        column: parser.column,
        position: parser.position,
      };
    };

    assertEq(getPosInfo("\r\n1"), { line: 1, column: 1, position: 3 });
    assertEq(getPosInfo("\r\r1"), { line: 2, column: 1, position: 3 });
    assertEq(getPosInfo("\n\n1"), { line: 2, column: 1, position: 3 });
    assertEq(getPosInfo("\r1"), { line: 1, column: 1, position: 2 });
    assertEq(getPosInfo("\n1"), { line: 1, column: 1, position: 2 });
  });

  test("number", () => {
    checkEvent("1.2", {
      save() {
        assertUnreachable("parent");
      },
      number: {
        save(val) {
          assertEq(val, 1.2);
        },
      },
      integer: {
        save() {
          assertUnreachable("child");
        },
      },
    });
    checkEvent("1.2", {
      save(val) {
        assertEq(val, 1.2);
      },
      integer: {
        save() {
          assertUnreachable("child");
        },
      },
      number: {},
    });

    checkEvent("1", {
      save() {
        assertUnreachable("parent");
      },
      number: {
        save() {
          assertUnreachable("child");
        },
      },
      integer: {
        save(val) {
          assertEq(val, 1n);
        },
      },
    });
    checkEvent("1", {
      save(val) {
        assertEq(val, 1);
      },
      number: {
        save() {
          assertUnreachable("child");
        },
      },
      integer: {},
    });
  });

  test("identifier", () => {
    checkEvent(`{\\u1234:11,A:12}`, { object: { keyReceiver: { feed() {} } } }, true, JSON5_OPTION);
    checkEvent(
      `{\\u1234:11,A:12}`,
      { object: { keyReceiver: { feed() {}, string: { save() {} } } } },
      false,
      JSON5_OPTION,
    );
  });
});
