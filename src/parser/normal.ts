import { JsonArray, JsonObject, JsonValue } from "../base";
import { JsonOption, parseJsonNumber } from "./base";
import { createJsonStreamParser, JsonStreamParserBase, JsonToken, patchJsonStreamParserBase } from "./stream";

namespace NormalState {
  export type _StateLess = { _start: boolean };
  export type _Number = { _start: boolean; _list: string[] };
  export type _String = { _start: boolean; _list: string[]; _isIdentifier?: boolean };
  export type _Object = { _start: boolean; _child?: JsonValue; _key?: string; _object: JsonObject };
  export type _Array = { _start: boolean; _child?: JsonValue; _index: number; _array: JsonArray };
  export type _Struct = _Object | _Array;
  export type _State = _StateLess | _Number | _String | _Struct;
}

export const createJsonNormalEmitter = <Opt extends JsonOption = JsonOption>() => {
  const _stack: NormalState._State[] = [{ _start: false }];
  let _ret: JsonValue | undefined = undefined;

  const enum SpecialParse {
    None = 0,
    Identifier = 1,
    Number = 2,
  }
  let _spec = SpecialParse.None;

  const _endValue = (value: JsonValue) => {
    _stack.pop();
    if (_stack.length !== 0) (_stack[_stack.length - 1] as NormalState._Struct)._child = value;
    else _ret = value;
  };

  const _feedNumber = (token: JsonToken<Opt> & { type: "number" }) => {
    const state = _stack[_stack.length - 1] as NormalState._Number;
    if (!state._start) {
      state._list = [];
      _spec = SpecialParse.Number;
      state._start = true;
    }
    state._list.push(token.character);
  };
  const _feedString = (token: JsonToken<Opt> & { type: "string" }) => {
    const state = _stack[_stack.length - 1] as NormalState._String;
    if (!state._start) {
      state._list = [];
      state._start = true;
    }
    if (token.subtype === "normal") state._list.push(token.character);
    else if (token.subtype === "escape" || token.subtype === "escape_unicode" || token.subtype === "escape_hex") {
      if (token.escaped_value !== undefined) state._list.push(token.escaped_value);
    } else if (token.subtype === "end") _endValue(state._list.join(""));
  };
  const _feedIdentifier = (token: JsonToken<Opt> & { type: "identifier" }) => {
    const state = _stack[_stack.length - 1] as NormalState._String;
    if (!state._start) {
      state._list = [];
      _spec = SpecialParse.Identifier;
      state._start = true;
    }
    if (token.subtype === "normal") state._list.push(token.character);
    else if (token.subtype === "escape" && token.escaped_value !== undefined) state._list.push(token.escaped_value);
  };
  const _feedObject = (token: JsonToken<Opt> & { type: "object" }) => {
    const state = _stack[_stack.length - 1] as NormalState._Object;
    if (!state._start) {
      state._object = {};
      state._start = true;
      _stack.push({ _start: false });
      return;
    }
    /* if (token.subtype === "start") return; */
    if (token.subtype === "end") {
      if (state._key !== undefined) state._object[state._key] = state._child!; // trailing comma
      _endValue(state._object!);
    } else if (token.subtype === "next") {
      state._object[state._key!] = state._child!;
      state._key = state._child = undefined;
      _stack.push({ _start: false });
    } else {
      /* if (token.subtype === "value_start") */
      state._key = state._child as string | undefined;
      _stack.push({ _start: false });
    }
  };
  const _feedArray = (token: JsonToken<Opt> & { type: "array" }): void => {
    const state = _stack[_stack.length - 1] as NormalState._Array;
    if (!state._start) {
      state._index = 0;
      state._array = [];
      state._start = true;
      _stack.push({ _start: false });
      return;
    }
    /* if (token.subtype === "start") return; */
    if (token.subtype === "end") {
      if (state._child !== undefined) (state._array as JsonArray)[state._index] = state._child!; // trailing comma
      _endValue(state._array);
    } else {
      /* if(token.subtype === 'next') */
      state._array[state._index] = state._child!;
      state._child = undefined;
      ++state._index;
      _stack.push({ _start: false });
    }
  };

  return {
    feed(token: JsonToken<Opt>) {
      let state = _stack[_stack.length - 1];
      if (state === undefined) return;
      if (_spec) {
        if (_spec === SpecialParse.Number) {
          if (token.type !== "number") {
            _endValue(parseJsonNumber((state as NormalState._Number)._list.join("")));
            _spec = SpecialParse.None;
            state = _stack[_stack.length - 1];
          }
        } else {
          if (token.type !== "identifier") {
            _endValue((state as NormalState._String)._list.join(""));
            _spec = SpecialParse.None;
            state = _stack[_stack.length - 1];
          }
        }
      } else if (!state._start && token.subtype === "end" && token.type !== "string") {
        // trailing comma
        _stack.pop();
        state = _stack[_stack.length - 1];
      }
      if (token.type === "whitespace" || token.type === "comment" || token.type === "eof") return;

      switch (token.type) {
        case "number":
          _feedNumber(token);
          break;
        case "string":
          _feedString(token);
          break;
        case "identifier":
          _feedIdentifier(token);
          break;
        case "object":
          _feedObject(token);
          break;
        case "array":
          _feedArray(token);
          break;
        default:
          if (token.done) {
            if (token.type === "null") _endValue(null);
            else if (token.type === "true") _endValue(true);
            else /* if (token.type === "false") */ _endValue(false);
          }
      }
    },

    get() {
      return _ret;
    },
  };
};

export const jsonNormalEmit = <Opt extends JsonOption = JsonOption>(tokens: Iterable<JsonToken<Opt>>) => {
  const emitter = createJsonNormalEmitter();
  for (const token of tokens) emitter.feed(token);
  return emitter.get() as JsonValue;
};

export interface JsonNormalParser extends JsonStreamParserBase {
  feed: (s: string) => void;
  end: () => void;
  get: () => JsonValue | undefined;
}
export const createJsonNormalParser = <Opt extends JsonOption = JsonOption>(option?: Opt): JsonNormalParser => {
  const _parser = createJsonStreamParser(option);
  const _emitter = createJsonNormalEmitter<Opt>();
  const _token = {};
  return patchJsonStreamParserBase(
    {
      feed(s: string) {
        for (const c of s) _emitter.feed(_parser.feedOneTo(_token, c));
      },
      end() {
        _emitter.feed(_parser.end());
      },
      get() {
        return _emitter.get();
      },
    },
    _parser,
  );
};

export const jsonNormalParse = <Opt extends JsonOption = JsonOption>(str: string, option?: Opt) => {
  const emitter = createJsonNormalEmitter<Opt>();
  const baseParser = createJsonStreamParser(option);
  const token = {};
  for (const c of str) emitter.feed(baseParser.feedOneTo(token, c));
  emitter.feed(baseParser.end());
  return emitter.get();
};
