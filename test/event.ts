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

const checkEventSave = (s: string, receiver: Record<string, Function>, option?: JsonOption) => {
  let done: Record<keyof typeof receiver, Function> = {};
  const real_receiver: Record<string, Object> = {};

  for (const key in receiver) {
    const func = receiver[key];
    real_receiver[key] = {
      save: (val: any) => {
        if (done[key]) throw new Error(`${key} saved multiple times`);
        done[key] = func;
        func(val);
      },
    };
  }
  jsonEventParse(s, real_receiver as JsonEventReceiver, option);

  const num = Object.keys(done).length;
  if (num === 0) throw new Error(`no event saved`);
  else if (num !== 1) throw new Error(`multiple events saved: ${Object.keys(done).join(", ")}`);
};

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
      JSON5_OPTION
    );

    jsonEventEmit(jsonStreamParse("{a:1,b:2,\\u0032:3,}", JSON5_OPTION), {
      object: {
        keyReceiver: JsonDefaultEventReceiver,
      },
    });
  });

  test("integer", () => {
    {
      const option: JsonOption = {
        acceptOctalInteger: true,
        acceptBinaryInteger: true,
        acceptHexadecimalInteger: true,
      };
      checkEventSave("12", { integer: (num: bigint) => assertEq(num, 12n) }, option);
      checkEventSave("0x12", { integer: (num: bigint) => assertEq(num, 0x12n) }, option);
      checkEventSave("0o12", { integer: (num: bigint) => assertEq(num, 0o12n) }, option);
      checkEventSave("0b10110", { integer: (num: bigint) => assertEq(num, 0b10110n) }, option);

      checkEventSave("-12", { integer: (num: bigint) => assertEq(num, -12n) }, option);
      checkEventSave("-0x12", { integer: (num: bigint) => assertEq(num, -0x12n) }, option);
      checkEventSave("-0o12", { integer: (num: bigint) => assertEq(num, -0o12n) }, option);
      checkEventSave("-0b10110", { integer: (num: bigint) => assertEq(num, -0b10110n) }, option);
    }
  });

  test("integer[zero]", () => {
    const option: JsonOption = {
      acceptOctalInteger: true,
      acceptBinaryInteger: true,
      acceptHexadecimalInteger: true,
      acceptPositiveSign: true,
    };

    checkEventSave("0", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("+0", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("-0", { number: (num: number) => assertEq(num, -0) }, option);

    checkEventSave("0x0", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("+0x0", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("-0x0", { integer: (num: bigint) => assertEq(num, 0n) }, option);

    checkEventSave("0x00", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("+0x00", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("-0x00", { integer: (num: bigint) => assertEq(num, 0n) }, option);

    checkEventSave("0o0", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("+0o0", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("-0o0", { integer: (num: bigint) => assertEq(num, 0n) }, option);

    checkEventSave("0o00", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("+0o00", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("-0o00", { integer: (num: bigint) => assertEq(num, 0n) }, option);

    checkEventSave("0b0", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("+0b0", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("-0b0", { integer: (num: bigint) => assertEq(num, 0n) }, option);

    checkEventSave("0b00", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("+0b00", { integer: (num: bigint) => assertEq(num, 0n) }, option);
    checkEventSave("-0b00", { integer: (num: bigint) => assertEq(num, 0n) }, option);
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
    const type_list = ["null", "integer", "number", "boolean", "string", "array", "object"];

    for (let i = 0; i < list.length; i++)
      for (const type of type_list) {
        checkEvent(list[i][0], { [type]: { save() {} } }, !list[i][1].includes(type), JSON5_OPTION);
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
      save: () => assertUnreachable("parent"),
      number: { save: (val) => assertEq(val, 1.2) },
      integer: { save: () => assertUnreachable("child") },
    });
    checkEvent("1.2", {
      save: (val) => assertEq(val, 1.2),
      integer: { save: () => assertUnreachable("child") },
      number: {},
    });

    checkEvent("1", {
      save: () => assertUnreachable("parent"),
      number: { save: () => assertUnreachable("child") },
      integer: { save: (val) => assertEq(val, 1n) },
    });
    checkEvent("1", {
      save: (val) => assertEq(val, 1),
      number: { save: () => assertUnreachable("child") },
      integer: {},
    });
  });

  test("identifier", () => {
    checkEvent(`{\\u1234:11,A:12}`, { object: { keyReceiver: { feed() {} } } }, true, JSON5_OPTION);
    checkEvent(
      `{\\u1234:11,A:12}`,
      { object: { keyReceiver: { feed() {}, string: { save() {} } } } },
      false,
      JSON5_OPTION
    );
  });

  test("array", () => {
    checkEvent(
      "[1,2]",
      {
        array: {
          set(index, value) {
            switch (index) {
              case 0:
                assertEq(value, 1);
                break;
              case 1:
                assertEq(value, 2);
                break;
              default:
                assertUnreachable(`index ${index}`);
            }
          },
        },
      },
      false,
      JSON5_OPTION
    );
  });
});
