import { JSON5_OPTION, jsonNormalParse, JsonOption } from "../../../src/index";

const FAILED_LIST = [
  // `"A JSON payload should be an object or array, not a string."`,
  `{"Extra value after close": true} "misplaced quoted value"`,
  `{"Illegal expression": 1 + 2}`,
  `{"Illegal invocation": alert()}`,
  `{"Numbers cannot have leading zeroes": 013}`,
  `{"Numbers cannot be hex": 0x14}`,
  `["Illegal backslash escape: \\x15"]`,
  `[\\naked]`,
  `["Illegal backslash escape: \\017"]`,
  // `[[[[[[[[[[[[[[[[[[[["Too deep"]]]]]]]]]]]]]]]]]]]]`,
  `{"Missing colon" null}`,
  `["Unclosed array"`,
  `{"Double colon":: null}`,
  `{"Comma instead of colon", null}`,
  `["Colon instead of comma": false]`,
  `["Bad value", truth]`,
  `['single quote']`,
  `["\ttab\tcharacter\tin\tstring  "]`,
  `["tab\\   character\\   in\\  string\\  "]`,
  `["line
break"]`,
  `["line\\
break"]`,
  `[0e]`,
  `{unquoted_key: "keys must be quoted"}`,
  `[0e+]`,
  `[0e+-1]`,
  `{"Comma instead if closing brace": true,`,
  `["mismatch"}`,
  `["extra comma",]`,
  `["double extra comma",,]`,
  `[   , "<-- missing value"]`,
  `["Comma after the close"],`,
  `["Extra close"]]`,
  `{"Extra comma": true,}`,
];
const PASSED_LIST = [
  `[
    "JSON Test Pattern pass1",
    {"object with 1 member":["array with 1 element"]},
    {},
    [],
    -42,
    true,
    false,
    null,
    {
        "integer": 1234567890,
        "real": -9876.543210,
        "e": 0.123456789e-12,
        "E": 1.234567890E+34,
        "":  23456789012E66,
        "zero": 0,
        "one": 1,
        "space": " ",
        "quote": "\\"",
        "backslash": "\\\\",
        "controls": "\\b\\f\\n\\r\\t",
        "slash": "/ & \\/",
        "alpha": "abcdefghijklmnopqrstuvwyz",
        "ALPHA": "ABCDEFGHIJKLMNOPQRSTUVWYZ",
        "digit": "0123456789",
        "0123456789": "digit",
        "special": "\`1~!@#$%^&*()_+-={':[,]}|;.</>?",
        "hex": "\\u0123\\u4567\\u89AB\\uCDEF\\uabcd\\uef4A",
        "true": true,
        "false": false,
        "null": null,
        "array":[  ],
        "object":{  },
        "address": "50 St. James Street",
        "url": "http://www.JSON.org/",
        "comment": "// /* <!-- --",
        "# -- --> */": " ",
        " s p a c e d " :[1,2 , 3

,

4 , 5        ,          6           ,7        ],"compact":[1,2,3,4,5,6,7],
        "jsontext": "{\\"object with 1 member\\":[\\"array with 1 element\\"]}",
        "quotes": "&#34; \\u0022 %22 0x22 034 &#x22;",
        "\\/\\\\\\"\\uCAFE\\uBABE\\uAB98\\uFCDE\\ubcda\\uef4A\\b\\f\\n\\r\\t\`1~!@#$%^&*()_+-=[]{}|;:',./<>?"
: "A key can be any string"
    },
    0.5 ,98.6
,
99.44
,

1066,
1e1,
0.1e1,
1e-1,
1e00,2e+00,2e-00
,"rosebud"]`,
  `[[[[[[[[[[[[[[[[[[["Not too deep"]]]]]]]]]]]]]]]]]]]`,
  `{
    "JSON Test Pattern pass3": {
        "The outermost value": "must be an object or array.",
        "In this test": "It is an object."
    }
}
`,
];

const checkOnlyState = <Opt extends JsonOption = JsonOption>(s: string, has_exception: boolean, option?: Opt) => {
  let ret: any;
  try {
    ret = jsonNormalParse(s, option);
  } catch (e) {
    if (has_exception) return;
    throw new Error(`${s}\n${option}\nexpected no error, but got: ${e}`);
  }
  if (has_exception) {
    throw new Error(`${s}\n${option}\nexpected error, but got nothing`);
  }
};

describe("normal[official_json]", () => {
  test("json", () => {
    for (const s of FAILED_LIST) checkOnlyState(s, true);
    for (const s of PASSED_LIST) checkOnlyState(s, false);
  });
});
