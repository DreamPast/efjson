import { checkNormal } from "../../_util";

describe("normal[number]", () => {
  test("binary", () => {
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0b", "0bF", "0b1g", "0B", "0BF", "0B1g", "0b1.", "0b1e2", "0b1p2"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, undefined, { acceptBinaryInteger: true });
        checkNormal(s, undefined, {
          acceptBinaryInteger: true,
          acceptPositiveSign: true,
        });
      }
    }
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0b11", "0B11"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, sign !== "+" ? parseInt(`${sign}11`, 2) : undefined, {
          acceptBinaryInteger: true,
        });
        checkNormal(s, parseInt(`${sign}11`, 2), {
          acceptBinaryInteger: true,
          acceptPositiveSign: true,
        });
      }
    }
  });
});
