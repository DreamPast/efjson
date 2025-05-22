import { jsonEventParse, JsonOption } from "efjson";
import { assertEq } from "../util";
{
  const option: JsonOption = {
    acceptOctalInteger: true,
    acceptBinaryInteger: true,
    acceptHexadecimalInteger: true,
  };
  {
    let done = false;
    jsonEventParse(
      "0x12",
      {
        type: "number",
        save(num) {
          done = true;
          assertEq(num, 0x12);
        },
      },
      option,
    );
    assertEq(done, true);
  }
  {
    let done = false;
    jsonEventParse(
      "0o12",
      {
        type: "number",
        save(num) {
          done = true;
          assertEq(num, 0o12);
        },
      },
      option,
    );
    assertEq(done, true);
  }
  {
    let done = false;
    jsonEventParse(
      "0b10110",
      {
        type: "number",
        save(num) {
          done = true;
          assertEq(num, 0b10110);
        },
      },
      option,
    );
    assertEq(done, true);
  }
}
