import { checkNormal } from "../../_util";

describe("normal[number]", () => {
  test("octal", () => {
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0o", "0oF", "0o1g", "0O", "0OF", "0O1g", "0o1.", "0o1e2", "0o1p2"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, undefined, { acceptOctalInteger: true });
        checkNormal(s, undefined, {
          acceptOctalInteger: true,
          acceptPositiveSign: true,
        });
      }
    }
    for (const sign of ["", "+", "-"]) {
      for (const part of ["0o11", "0O11"]) {
        const s = sign + part;
        checkNormal(s, undefined);
        checkNormal(s, sign !== "+" ? parseInt(`${sign}11`, 8) : undefined, {
          acceptOctalInteger: true,
        });
        checkNormal(s, parseInt(`${sign}11`, 8), {
          acceptOctalInteger: true,
          acceptPositiveSign: true,
        });
      }
    }
  });
});
