import { jsonEventParse, JsonOption } from "../../efjson";
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
          console.assert(num === 0x12, `expected 0x12 but got ${num}`);
        },
      },
      option
    );
    console.assert(done, "save not called");
  }
  {
    let done = false;
    jsonEventParse(
      "0o12",
      {
        type: "number",
        save(num) {
          done = true;
          console.assert(num === 0o12, `expected 0o12 but got ${num}`);
        },
      },
      option
    );
    console.assert(done, "save not called");
  }
  {
    let done = false;
    jsonEventParse(
      "0b10110",
      {
        type: "number",
        save(num) {
          done = true;
          console.assert(num === 0b10110, `expected 0b10110 but got ${num}`);
        },
      },
      option
    );
    console.assert(done, "save not called");
  }
}
