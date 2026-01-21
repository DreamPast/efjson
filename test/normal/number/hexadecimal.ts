import { checkNormal } from "../../_util";

describe("normal[number]", () => {
  test("hexadecimal", () => {
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0x", "0x1g", "0X", "0X1g", "0x1.", "0x1p2"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, undefined, { acceptHexadecimalInteger: true });
        checkNormal(s, undefined, {
          acceptHexadecimalInteger: true,
          acceptPositiveSign: true,
        });
      }
    }
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0x11", "0x1F", "0X11", "0X1F"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, sign !== "+" ? parseInt(s) : undefined, {
          acceptHexadecimalInteger: true,
        });
        checkNormal(s, parseInt(s), {
          acceptHexadecimalInteger: true,
          acceptPositiveSign: true,
        });
      }
    }
  });
});
