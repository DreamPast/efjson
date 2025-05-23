import { checkNormal, combineCall } from "../util";

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
{
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
}
{
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
}
{
  for (const sign of ["", "+", "-"]) {
    for (const s of [`${sign}0x`, `${sign}0x1g`, `${sign}0X`, `${sign}0X1g`]) {
      checkNormal(s, undefined);
      checkNormal(s, undefined, { acceptHexadecimalInteger: true });
      checkNormal(s, undefined, { acceptHexadecimalInteger: true, acceptPositiveSign: true });
    }
  }
  for (const sign of ["", "+", "-"]) {
    for (const s of [`${sign}0x1`, `${sign}0xF`, `${sign}0X1`, `${sign}0XF`]) {
      checkNormal(s, undefined);
      checkNormal(s, sign !== "+" ? parseInt(s) : undefined, { acceptHexadecimalInteger: true });
      checkNormal(s, parseInt(s), { acceptHexadecimalInteger: true, acceptPositiveSign: true });
    }
  }
}
{
  for (const sign of ["", "+", "-"]) {
    for (const s of [`${sign}0o`, `${sign}0oF`, `${sign}0o1g`, `${sign}0O`, `${sign}0OF`, `${sign}0O1g`]) {
      checkNormal(s, undefined);
      checkNormal(s, undefined, { acceptOctalInteger: true });
      checkNormal(s, undefined, { acceptOctalInteger: true, acceptPositiveSign: true });
    }
  }
  for (const sign of ["", "+", "-"]) {
    for (const s of [`${sign}0o1`, `${sign}0O1`]) {
      checkNormal(s, undefined);
      checkNormal(s, sign !== "+" ? parseInt(`${sign}1`) : undefined, { acceptOctalInteger: true });
      checkNormal(s, parseInt(`${sign}1`), { acceptOctalInteger: true, acceptPositiveSign: true });
    }
  }
}
{
  for (const sign of ["", "+", "-"]) {
    for (const s of [`${sign}0b`, `${sign}0bF`, `${sign}0b1g`, `${sign}0B`, `${sign}0BF`, `${sign}0B1g`]) {
      checkNormal(s, undefined);
      checkNormal(s, undefined, { acceptBinaryInteger: true });
      checkNormal(s, undefined, { acceptBinaryInteger: true, acceptPositiveSign: true });
    }
  }
  for (const sign of ["", "+", "-"]) {
    for (const s of [`${sign}0b1`, `${sign}0B1`]) {
      checkNormal(s, undefined);
      checkNormal(s, sign !== "+" ? parseInt(`${sign}1`) : undefined, { acceptBinaryInteger: true });
      checkNormal(s, parseInt(`${sign}1`), { acceptBinaryInteger: true, acceptPositiveSign: true });
    }
  }
}
