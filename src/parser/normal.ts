import { JsonArray, JsonObject, JsonValue } from "../base";
import { JsonOption, parseJsonNumber } from "./base";
import { createJsonStreamParser, JsonToken } from "./stream";
type AllJsonToken = JsonToken;

namespace NormalState {
  export type _Unknown = {
    _type?: undefined;
  };
  export type _StateLess = {
    _type: "null" | "true" | "false";
    _save?: undefined;
  };
  export type _Number = {
    _type: "number";
    _list: string[];
  };
  export type _String = {
    _type: "string";
    _list: string[];
    _isIdentifier?: boolean;
  };

  export type _Object = {
    _type: "object";
    _child?: JsonValue;
    _key?: string;
    _object: JsonObject;
  };
  export type _Array = {
    _type: "array";
    _child?: JsonValue;
    _index: number;
    _array: JsonArray;
  };
  export type _Struct = _Object | _Array;

  export type _State = _Unknown | _StateLess | _Number | _String | _Struct;
}

export const createJsonNormalEmitter = <Opt extends JsonOption = JsonOption>() => {
  const _state: NormalState._State[] = [{}];
  let _ret: any = undefined;

  const _endValue = (value: JsonValue) => {
    _state.pop();
    if (_state.length !== 0) (_state[_state.length - 1] as NormalState._Struct)._child = value;
    else _ret = value;
  };

  const _feedNumber = (token: AllJsonToken & { type: "number" }) => {
    const state = _state[_state.length - 1] as NormalState._Number;
    if (state._type === undefined) {
      state._type = "number";
      state._list = [];
    }
    state._list.push(token.character);
  };
  const _feedString = (token: AllJsonToken & { type: "string" }) => {
    const state = _state[_state.length - 1] as NormalState._String;
    if (state._type === undefined) {
      state._type = "string";
      state._list = [];
    }
    if (token.subtype === "normal") {
      state._list.push(token.character);
    } else if (token.subtype === "escape" || token.subtype === "escape_unicode" || token.subtype === "escape_hex") {
      if (token.escaped_value !== undefined) {
        state._list.push(token.escaped_value);
      }
    } else if (token.subtype === "end") {
      _endValue(state._list.join(""));
    }
  };
  const _feedIdentifier = (token: AllJsonToken & { type: "identifier" }) => {
    const state = _state[_state.length - 1] as NormalState._String;
    if (state._type === undefined) {
      state._type = "string";
      state._list = [];
      state._isIdentifier = true;
    }
    if (token.subtype === "normal") {
      state._list.push(token.character);
    } else if (token.subtype === "escape") {
      if (token.escaped_value !== undefined) {
        state._list.push(token.escaped_value);
      }
    }
  };
  const _feedObject = (token: AllJsonToken & { type: "object" }) => {
    let state = _state[_state.length - 1] as NormalState._Object;
    if (state._type === undefined) {
      if (token.subtype === "end") {
        _state.pop();
        state = _state[_state.length - 1] as NormalState._Object;
      } else {
        state._type = "object";
        state._object = {};
        _state.push({});
        return;
      }
    }
    if (token.subtype === "start") return;
    if (token.subtype === "end") {
      if (state._key !== undefined) {
        // trailing comma
        state._object[state._key] = state._child!;
      }
      return _endValue(state._object);
    }
    if (token.subtype === "next") {
      state._object[state._key!] = state._child!;
      state._key = state._child = undefined;
      _state.push({});
      return;
    }
    /* if (token.subtype === "value_start") */ {
      state._key = state._child as string | undefined;
      _state.push({});
    }
  };
  const _feedArray = (token: AllJsonToken & { type: "array" }): void => {
    let state = _state[_state.length - 1] as NormalState._Array;
    if (state._type === undefined) {
      if (token.subtype === "end") {
        // trailing comma
        _state.pop();
        state = _state[_state.length - 1] as NormalState._Array;
      } else {
        state._type = "array";
        state._index = 0;
        state._array = [];
        _state.push({});
        return;
      }
    }
    if (token.subtype === "start") return;
    if (token.subtype === "end") {
      if (state._child !== undefined) {
        state._array[state._index] = state._child!; // trailing comma
      }
      return _endValue(state._array);
    }

    /* if(token.subtype === 'next') */ {
      state._array[state._index] = state._child!;
      state._child = undefined;
      ++state._index;
      _state.push({});
    }
  };

  return {
    feed(token: JsonToken<Opt>) {
      let state = _state[_state.length - 1];
      if (state === undefined) return;
      if (state._type === "number" && token.type !== "number") {
        const str = (state as NormalState._Number)._list.join("");
        _endValue(parseJsonNumber(str));
        state = _state[_state.length - 1];
      } else if ((state as NormalState._String)._isIdentifier && token.type !== "identifier") {
        _endValue((state as NormalState._String)._list.join(""));
        state = _state[_state.length - 1];
      } else if (state._type === undefined)
        if ((token as any).subtype === "end" && token.type !== "string") {
          // trailing comma
          _state.pop();
          state = _state[_state.length - 1];
        }
      if (token.type === "whitespace" || token.type === "comment" || token.type === "eof") return;

      switch (token.type) {
        case "number":
          return _feedNumber(token);
        case "string":
          return _feedString(token);
        case "identifier":
          return _feedIdentifier(token);

        case "object":
          return _feedObject(token);
        case "array":
          return _feedArray(token);

        default:
          if (token.done) {
            if (token.type === "null") return _endValue(null);
            else if (token.type === "true") return _endValue(true);
            else if (token.type === "false") return _endValue(false);
          }
      }
    },

    get() {
      return _ret as JsonValue | undefined;
    },
  };
};

export const jsonNormalEmit = <Opt extends JsonOption = JsonOption>(tokens: Iterable<JsonToken<Opt>>) => {
  const emitter = createJsonNormalEmitter();
  for (const token of tokens) emitter.feed(token);
};

export interface JsonNormalParser {
  feed: (s: string) => void;
  end: () => void;
  get: () => JsonValue | undefined;

  get position(): number;
  get line(): number;
  get column(): number;
}
export const createJsonNormalParser = <Opt extends JsonOption = JsonOption>(option?: Opt): JsonNormalParser => {
  const _parser = createJsonStreamParser(option);
  const _emitter = createJsonNormalEmitter<Opt>();
  const _token = {};
  return {
    feed(s: string) {
      for (const c of s) _emitter.feed(_parser.feedOneTo(_token, c));
    },
    end() {
      _emitter.feed(_parser.end());
    },
    get() {
      return _emitter.get();
    },
    get position() {
      return _parser.position;
    },
    get line() {
      return _parser.line;
    },
    get column() {
      return _parser.column;
    },
  };
};

export const jsonNormalParse = <Opt extends JsonOption = JsonOption>(str: Iterable<string>, option?: Opt) => {
  const parser = createJsonNormalParser(option);
  if (typeof str === "string") parser.feed(str);
  else for (const s of str) parser.feed(s);
  parser.end();
  return parser.get() as JsonValue;
};
export const jsonNormalParseAsync = async <Opt extends JsonOption = JsonOption>(
  str: AsyncIterable<string>,
  option?: Opt,
) => {
  const parser = createJsonNormalParser(option);
  for await (const s of str) parser.feed(s);
  parser.end();
  return parser.get() as JsonValue;
};
