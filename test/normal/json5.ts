import { JSON5_OPTION, JsonOption } from "../../src/index";
import { checkNormal } from "../_util";

test("normal[json5]", () => {
  const str = `{
  // comments
  unquoted: "I am unquoted" // comments
,
  \\u0032: "I am also unquoted",
  "comments" /* comment here */: /* or here */ "a" /* and here */, /**/
  'singleQuotes': 'I can use "double quotes" here',
  "lineBreaks": "Look, Mom! \\
No \\\\n's! \\x40",
  "hexadecimal": 0xdecaf,
  "leadingDecimalPoint": .8675309, "andTrailing": 8675309.,
  "positiveSign": +1,
  "trailingComma": 'in objects', "andIn": ['arrays',],
  "backwardsCompatible": "with JSON",
  "dict": { string: 'string', number: 12, boolean: true, null: null, array: [], object: {} },
  "nan": NaN,
  "infinity": \u3000 [Infinity, -Infinity],
}
`;

  checkNormal(
    str,
    {
      unquoted: "I am unquoted",
      "\u0032": "I am also unquoted",
      comments: "a",
      singleQuotes: 'I can use "double quotes" here',
      lineBreaks: "Look, Mom! No \\n's! \x40",
      hexadecimal: 0xdecaf,
      leadingDecimalPoint: 0.8675309,
      andTrailing: 8675309,
      positiveSign: +1,
      trailingComma: "in objects",
      andIn: ["arrays"],
      backwardsCompatible: "with JSON",
      dict: { string: "string", number: 12, boolean: true, null: null, array: [], object: {} },
      nan: NaN,
      infinity: [Infinity, -Infinity],
    },
    JSON5_OPTION
  );

  const option: JsonOption = Object.assign({}, JSON5_OPTION);
  for (const key in option) {
    option[key as keyof typeof option] = false;
    checkNormal(str, undefined, option);
    option[key as keyof typeof option] = true;
  }
});
