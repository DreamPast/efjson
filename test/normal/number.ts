import { checkNormal, combineCall } from "../_util";

describe("normal[number]", () => {
  checkNormal("1", 1);
  checkNormal("-1", -1);
  checkNormal("10", 10);
  checkNormal("-10", -10);
  checkNormal("0", 0);
  checkNormal("-0", -0);
  checkNormal("00", undefined);
  checkNormal("-00", undefined);
  checkNormal("-01", undefined);
  checkNormal("01", undefined);
  checkNormal("0x1", undefined);
  checkNormal("0x0", undefined);
  checkNormal("0o1", undefined);
  checkNormal("0o0", undefined);
  checkNormal("0b1", undefined);
  checkNormal("0b0", undefined);

  checkNormal("-", undefined);
  checkNormal("+", undefined);
  checkNormal("+", undefined, { acceptPositiveSign: true });
  checkNormal("1//", undefined);
  checkNormal("1//", 1, { acceptSingleLineComment: true });
  checkNormal("1/**/", 1, { acceptMultiLineComment: true });
  checkNormal("1 ", 1);

  checkNormal("1.z", undefined);
  checkNormal("1.1z", undefined);
  checkNormal("1ez", undefined);
  checkNormal("1e1z", undefined);
  checkNormal("1e1+", undefined);
  checkNormal("1e++2", undefined);
  checkNormal("1 2", undefined);

  {
    checkNormal("+10", undefined);
    checkNormal("+0", undefined);
    checkNormal("+00", undefined);

    checkNormal("+10", +10, { acceptPositiveSign: true });
    checkNormal("+0", +0, { acceptPositiveSign: true });
    checkNormal("+00", undefined, { acceptPositiveSign: true });
  }

  combineCall(
    [
      ["-", "+", ""],
      ["0", "1", ""],
      ["0", "1", "00", "01", "1", ""],
      ["e", "e+", "e-", "E", "E+", "E-"],
      ["1", "01", "10", "0", "00", "a", "z", ""],
    ],
    (choice) => {
      const s = `${choice.slice(0, 2).join("")}.${choice.slice(2, 5).join("")}`;
      for (const acceptPositiveSign of [true, false])
        for (const acceptEmptyInteger of [true, false])
          for (const acceptEmptyFraction of [true, false]) {
            let right = !(choice[4] === "a" || choice[4] === "z" || choice[4] === "");
            if (!acceptPositiveSign && choice[0] == "+") right &&= false;
            if (!acceptEmptyInteger && choice[1] == "") right &&= false;
            if (!acceptEmptyFraction && choice[2] == "") right &&= false;
            checkNormal(s, right ? parseFloat(s) : undefined, {
              acceptPositiveSign,
              acceptEmptyFraction,
              acceptEmptyInteger,
            });
          }
    },
  );
  test("infinity", () => {
    const str = "Infinity";
    for (let i = 1; i <= 8; ++i) {
      checkNormal(str.slice(0, i), undefined);
      checkNormal("-" + str.slice(0, i), undefined);
      checkNormal("+" + str.slice(0, i), undefined);

      checkNormal("1" + str.slice(0, i), undefined);
      checkNormal("-1" + str.slice(0, i), undefined);
      checkNormal("+1" + str.slice(0, i), undefined);
      checkNormal("0" + str.slice(0, i), undefined);
      checkNormal("-0" + str.slice(0, i), undefined);
      checkNormal("+0" + str.slice(0, i), undefined);

      checkNormal(str.slice(0, i), i !== 8 ? undefined : Infinity, { acceptInfinity: true });
      checkNormal("-" + str.slice(0, i), i !== 8 ? undefined : -Infinity, { acceptInfinity: true });
      checkNormal("+" + str.slice(0, i), undefined, { acceptInfinity: true });

      checkNormal("+" + str.slice(0, i), i !== 8 ? undefined : +Infinity, {
        acceptInfinity: true,
        acceptPositiveSign: true,
      });
    }
  });
  test("nan", () => {
    const str = "NaN";
    for (let i = 1; i <= 3; ++i) {
      checkNormal(str.slice(0, i), undefined);
      checkNormal("-" + str.slice(0, i), undefined);
      checkNormal("+" + str.slice(0, i), undefined);

      checkNormal("1" + str.slice(0, i), undefined);
      checkNormal("-1" + str.slice(0, i), undefined);
      checkNormal("+1" + str.slice(0, i), undefined);
      checkNormal("0" + str.slice(0, i), undefined);
      checkNormal("-0" + str.slice(0, i), undefined);
      checkNormal("+0" + str.slice(0, i), undefined);

      checkNormal(str.slice(0, i), i !== 3 ? undefined : NaN, { acceptNan: true });
      checkNormal("-" + str.slice(0, i), i !== 3 ? undefined : -NaN, { acceptNan: true });
      checkNormal("+" + str.slice(0, i), undefined, { acceptNan: true });

      checkNormal("+" + str.slice(0, i), i !== 3 ? undefined : +NaN, {
        acceptNan: true,
        acceptPositiveSign: true,
      });
    }
  });
  test("hexadecimal", () => {
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0x", "0x1g", "0X", "0X1g", "0x1.", "0x1p2"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, undefined, { acceptHexadecimalInteger: true });
        checkNormal(s, undefined, { acceptHexadecimalInteger: true, acceptPositiveSign: true });
      }
    }
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0x11", "0x1F", "0X11", "0X1F"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, sign !== "+" ? parseInt(s) : undefined, { acceptHexadecimalInteger: true });
        checkNormal(s, parseInt(s), { acceptHexadecimalInteger: true, acceptPositiveSign: true });
      }
    }
  });
  test("octal", () => {
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0o", "0oF", "0o1g", "0O", "0OF", "0O1g", "0o1.", "0o1e2", "0o1p2"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, undefined, { acceptOctalInteger: true });
        checkNormal(s, undefined, { acceptOctalInteger: true, acceptPositiveSign: true });
      }
    }
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0o11", "0O11"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, sign !== "+" ? parseInt(`${sign}11`, 8) : undefined, { acceptOctalInteger: true });
        checkNormal(s, parseInt(`${sign}11`, 8), { acceptOctalInteger: true, acceptPositiveSign: true });
      }
    }
  });
  test("binary", () => {
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0b", "0bF", "0b1g", "0B", "0BF", "0B1g", "0b1.", "0b1e2", "0b1p2"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, undefined, { acceptBinaryInteger: true });
        checkNormal(s, undefined, { acceptBinaryInteger: true, acceptPositiveSign: true });
      }
    }
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0b11", "0B11"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, sign !== "+" ? parseInt(`${sign}11`, 2) : undefined, { acceptBinaryInteger: true });
        checkNormal(s, parseInt(`${sign}11`, 2), { acceptBinaryInteger: true, acceptPositiveSign: true });
      }
    }
  });
});
