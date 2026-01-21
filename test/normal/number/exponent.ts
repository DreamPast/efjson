import { checkNormal, combineCall } from "../../_util";

describe("normal[number]", () => {
  test("exponent", () => {
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
              if (choice[1] === "" && choice[2] === "") right = false;
              if (!acceptPositiveSign && choice[0] === "+") right &&= false;
              if (!acceptEmptyInteger && choice[1] === "") right &&= false;
              if (!acceptEmptyFraction && choice[2] === "") right &&= false;
              checkNormal(s, right ? parseFloat(s) : undefined, {
                acceptPositiveSign,
                acceptEmptyFraction,
                acceptEmptyInteger,
              });
            }
      }
    );
  });
});
