import { JSON5_OPTION, JsonOption } from "../../efjson";
import { checkError } from "../util";

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
  "backwardsCompatible": "with JSON",
  "dict": { string: 'string', number: 12, boolean: true, null: null, array: [,], object: {,} },
  "nan": NaN,
  "infinity": \u3000 [Infinity, -Infinity],
}
`;

checkError(str, false, JSON5_OPTION);
const option: JsonOption = Object.assign({}, JSON5_OPTION);
for (const key in option) {
  option[key as keyof typeof option] = false;
  checkError(str, true, option);
  option[key as keyof typeof option] = true;
}
