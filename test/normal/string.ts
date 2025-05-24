import { checkNormal, combineCall } from "../_util";

test("normal[string]", () => {
  {
    checkNormal('""', "");
    checkNormal('"', undefined);

    checkNormal('"\\""', '"');
    checkNormal('"\\\\"', "\\");
    checkNormal('"\\/"', "\/");
    checkNormal('"\\a"', undefined);
    checkNormal('"\\b"', "\b");
    checkNormal('"\\f"', "\f");
    checkNormal('"\\n"', "\n");
    checkNormal('"\\t"', "\t");

    checkNormal('"\\"', undefined);
    checkNormal('"\\\\', undefined);
    checkNormal('"\\/', undefined);
    checkNormal('"\\a', undefined);
    checkNormal('"\\b', undefined);
    checkNormal('"\\f', undefined);
    checkNormal('"\\n', undefined);
    checkNormal('"\\t', undefined);

    checkNormal("\"\\'", undefined);
    checkNormal('"\\\'"', undefined);

    checkNormal('"\\0', undefined);
    checkNormal('"\\1', undefined);
    checkNormal('"\\11', undefined);
    checkNormal('"\\111', undefined);

    checkNormal('"\\0"', undefined);
    checkNormal('"\\1"', undefined);
    checkNormal('"\\11"', undefined);
    checkNormal('"\\111"', undefined);
  }

  // hex Unicode
  {
    const arr = ["1", "a", "A", "f", "F"];
    combineCall(
      [arr],
      (x) => (checkNormal(`"\\u${x.join("")}`, undefined), checkNormal(`"\\u${x.join("")}"`, undefined)),
    );
    combineCall(
      [arr, arr],
      (x) => (checkNormal(`"\\u${x.join("")}`, undefined), checkNormal(`"\\u${x.join("")}"`, undefined)),
    );
    combineCall(
      [arr, arr, arr],
      (x) => (checkNormal(`"\\u${x.join("")}`, undefined), checkNormal(`"\\u${x.join("")}"`, undefined)),
    );
    combineCall(
      [arr, arr, arr, arr],
      (x) => (
        checkNormal(`"\\u${x.join("")}`, undefined),
        checkNormal(`"\\u${x.join("")}"`, String.fromCharCode(parseInt(x.join(""), 16)))
      ),
    );
  }

  // control characters
  for (let i = 0; i < 0x20; ++i) {
    checkNormal(`"${String.fromCharCode(i)}`, undefined);
    checkNormal(`"${String.fromCharCode(i)}"`, undefined);
  }

  /// JSON5
  {
    checkNormal("'s'", undefined);
    checkNormal("'s", undefined);

    checkNormal("'s'", "s", { acceptSingleQuote: true });
    checkNormal("'s", undefined, { acceptSingleQuote: true });
  }

  {
    for (const s of [
      ['"\\v"', "\v"],
      ['"\\0"', "\0"],
      ['"\\\'"', "'"],
      ['"\\x1F"', "\x1F"],
      ['"\\xF1"', "\xF1"],
    ]) {
      checkNormal(s[0], undefined);
      checkNormal(s[0], s[1], { accpetJson5StringEscape: true });
    }
    for (const s of ['"\\x"', '"\\x1"', '"\\xF"']) {
      checkNormal(s, undefined);
      checkNormal(s, undefined, { accpetJson5StringEscape: true });
    }
  }

  for (const s of ['"\\\n1"', '"\\\r1"', '"\\\r\n1"']) {
    checkNormal(s, undefined);
    checkNormal(s, "1", { acceptMultilineString: true });
  }
});
