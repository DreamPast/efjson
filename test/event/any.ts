import { jsonEventParse, JsonEventReceiver } from "../../efjson";
import { assertEq } from "../util";
{
  let saved: any;
  const receiver: JsonEventReceiver = {
    type: "any",
    dict: {
      string: {
        type: "string",
        save: (value: string) => {
          saved = +value;
        },
      },
      number: {
        type: "number",
        save: (value: number) => {
          saved = "" + value;
        },
      },
    },
  };

  saved = undefined;
  jsonEventParse("12", receiver);
  assertEq(typeof saved, "string");

  saved = undefined;
  jsonEventParse('"12"', receiver);
  assertEq(typeof saved, "number");
}

{
  let saved: any;
  const receiver: JsonEventReceiver = {
    type: "any",
    dict: {
      string: {
        type: "string",
        save: (value: string) => {
          saved = value;
        },
      },
      number: {
        type: "number",
        save: (value: number) => {
          saved = value;
        },
      },
    },
  };

  saved = undefined;
  jsonEventParse("12", receiver);
  assertEq(typeof saved, "number");

  saved = undefined;
  jsonEventParse('"12"', receiver);
  assertEq(typeof saved, "string");
}

{
  let saved: any;
  const option: JsonEventReceiver = {
    type: "any",
    save(val) {
      saved = { type: "any", value: val };
    },
    dict: {
      number: {
        type: "number",
        save: (value: number) => {
          saved = { type: "number", value };
        },
      },
      string: {
        type: "string",
      },
    },
  };

  saved = undefined;
  jsonEventParse("12", option);
  assertEq(saved.type, "number");

  saved = undefined;
  jsonEventParse('"12"', option);
  assertEq(saved.type, "any");
}
