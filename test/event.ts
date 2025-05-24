import {
  createJsonEventParser,
  JSON5_OPTION,
  jsonEventEmit,
  jsonEventParse,
  JsonEventReceiver,
  JsonOption,
  jsonStreamParse,
} from "../src/index";
import { assertEq, checkEvent, combine } from "./_util";

describe("event", () => {
  test("any", () => {
    {
      let saved: any;
      const receiver: JsonEventReceiver = {
        type: "any",
        dict: {
          string: {
            type: "string",
            save: (value: string) => {
              saved = +value;
            },
          },
          number: {
            type: "number",
            save: (value: number) => {
              saved = "" + value;
            },
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
        type: "any",
        dict: {
          string: {
            type: "string",
            save: (value: string) => {
              saved = value;
            },
          },
          number: {
            type: "number",
            save: (value: number) => {
              saved = value;
            },
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

    {
      let saved: any;
      const option: JsonEventReceiver = {
        type: "any",
        save(val) {
          saved = { type: "any", value: val };
        },
        dict: {
          number: {
            type: "number",
            save: (value: number) => {
              saved = { type: "number", value };
            },
          },
          string: {
            type: "string",
          },
        },
      };

      saved = undefined;
      jsonEventParse("12", option);
      assertEq(saved.type, "number");

      saved = undefined;
      jsonEventParse('"12"', option);
      assertEq(saved.type, "any");
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
        type: "object",
        subscribeList: [
          (key) => {
            if (["hexadecimal", "leadingDecimalPoint", "andTrailing", "positiveSign", "nan"].includes(key)) {
              return { type: "number" };
            } else if (["andIn", "infinity"].includes(key)) {
              return {
                type: "array",
                subscribeList: [() => undefined, () => ({ type: key === "andIn" ? "string" : "number" })],
                save() {},
              };
            } else if (key === "dict" || key === "dict2") {
              return {
                type: "object",
                subscribeList: [() => undefined, (k) => ({ type: k as any })],
                save() {},
              };
            } else {
              return { type: "string" };
            }
          },
        ],
      },
      JSON5_OPTION,
    );

    jsonEventEmit(jsonStreamParse("{a:1,b:2,\\u0032:3,}", JSON5_OPTION), {
      type: "object",
      keyReceiver: { type: "string", save() {}, feed() {} },
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
            type: "number",
            save(num) {
              done = true;
              assertEq(num, 0x12);
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
            type: "number",
            save(num) {
              done = true;
              assertEq(num, 0o12);
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
            type: "number",
            save(num) {
              done = true;
              assertEq(num, 0b10110);
            },
          },
          option,
        );
        assertEq(done, true);
      }
    }
  });

  test("mismatch", () => {
    const list = [
      ["null", "null"],
      ["1", "number"],
      ["true", "boolean"],
      ["false", "boolean"],
      ["[]", "array"],
      ["{}", "object"],
    ] as const;
    for (let i = 0; i < list.length; i++)
      for (let j = 0; j < list.length; j++) {
        checkEvent(list[i][0], { type: list[j][1] }, list[i][1] !== list[j][1], JSON5_OPTION);
      }
  });

  test("position", () => {
    const getPosInfo = (s: string) => {
      const parser = createJsonEventParser({ type: "any" });
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
});
