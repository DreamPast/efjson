import { JSON5_OPTION, jsonEventParse } from "efjson";

const str = `{
  // comments
  unquoted: "I am unquoted",
  \\u0032: "I am also unquoted",
  "comments" /* comment here */: /* or here */ "a" /* and here */, /**/
  'singleQuotes': 'I can use "double quotes" here',
  "lineBreaks": "Look, Mom! \\
No \\\\n's! \\x40",
  "hexadecimal": 0xdecaf,
  "leadingDecimalPoint": .8675309, "andTrailing": 8675309.,
  "positiveSign": +1,
  "trailingComma": 'in objects', "andIn": ['arrays',],
  "dict": { string: 'string', number: 12, boolean: true, null: null, array: [,], object: {,} },
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
        if (
          [
            "hexadecimal",
            "leadingDecimalPoint",
            "andTrailing",
            "positiveSign",
            "nan",
          ].includes(key)
        ) {
          return { type: "number" };
        } else if (["andIn", "infinity"].includes(key)) {
          return {
            type: "array",
            subscribeList: [
              () => ({ type: key === "andIn" ? "string" : "number" }),
            ],
          };
        } else if (key === "dict") {
          return {
            type: "object",
            subscribeList: [(k) => ({ type: k as any })],
          };
        } else {
          return { type: "string" };
        }
      },
    ],
  },
  JSON5_OPTION
);
