import { JsonArray, JsonObject, JsonValue } from "../base";
import { JsonOption, parseJsonNumber } from "./base";
import {
  Category,
  createJsonStreamParser,
  JsonStreamParserBase,
  JsonToken,
  patchJsonStreamParserBase,
  Type,
} from "./stream";

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

  const _feedNumber = (token: JsonToken<Opt> & { category: Category.NUMBER }) => {
    const state = _stack[_stack.length - 1] as NormalState._Number;
    if (!state._start) {
      state._list = [];
      _spec = SpecialParse.Number;
      state._start = true;
    }
    state._list.push(token.character);
  };
  const _feedString = (token: JsonToken<Opt> & { category: Category.STRING }) => {
    const state = _stack[_stack.length - 1] as NormalState._String;
    if (!state._start) {
      state._list = [];
      state._start = true;
    }
    if (token.type === Type.STRING_NORMAL) state._list.push(token.character);
    else if (
      token.type === Type.STRING_ESCAPE ||
      token.type === Type.STRING_ESCAPE_UNICODE ||
      token.type === Type.STRING_ESCAPE_HEX
    ) {
      if (token.escaped !== undefined) state._list.push(token.escaped);
    } else if (token.type === Type.STRING_END) _endValue(state._list.join(""));
  };
  const _feedIdentifier = (token: JsonToken<Opt> & { category: Category.IDENTIFIER }) => {
    const state = _stack[_stack.length - 1] as NormalState._String;
    if (!state._start) {
      state._list = [];
      _spec = SpecialParse.Identifier;
      state._start = true;
    }
    if (token.type === Type.IDENTIFIER_NORMAL) state._list.push(token.character);
    else if (token.type === Type.IDENTIFIER_ESCAPE && token.escaped !== undefined) state._list.push(token.escaped);
  };
  const _feedObject = (token: JsonToken<Opt> & { category: Category.OBJECT }) => {
    const state = _stack[_stack.length - 1] as NormalState._Object;
    if (!state._start) {
      state._object = {};
      state._start = true;
      _stack.push({ _start: false });
      return;
    }
    /* console.assert(token.type !== Type.OBJECT_START); */
    if (token.type === Type.OBJECT_END) {
      if (state._key !== undefined) state._object[state._key] = state._child!; // trailing comma
      _endValue(state._object!);
    } else if (token.type === Type.OBJECT_NEXT) {
      state._object[state._key!] = state._child!;
      state._key = state._child = undefined;
      _stack.push({ _start: false });
    } else {
      /* console.assert(token.type === Type.OBJECT_VALUE_START); */
      state._key = state._child as string | undefined;
      _stack.push({ _start: false });
    }
  };
  const _feedArray = (token: JsonToken<Opt> & { category: Category.ARRAY }): void => {
    const state = _stack[_stack.length - 1] as NormalState._Array;
    if (!state._start) {
      state._index = 0;
      state._array = [];
      state._start = true;
      _stack.push({ _start: false });
      return;
    }
    /* console.assert(token.type !== Type.ARRAY_START); */
    if (token.type === Type.ARRAY_END) {
      if (state._child !== undefined) (state._array as JsonArray)[state._index] = state._child!; // trailing comma
      _endValue(state._array);
    } else {
      /* console.assert(token.type === Type.ARRAY_NEXT); */
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
          if (token.category !== Category.NUMBER) {
            _endValue(parseJsonNumber((state as NormalState._Number)._list.join("")));
            _spec = SpecialParse.None;
            state = _stack[_stack.length - 1];
          }
        } else {
          if (token.category !== Category.IDENTIFIER) {
            _endValue((state as NormalState._String)._list.join(""));
            _spec = SpecialParse.None;
            state = _stack[_stack.length - 1];
          }
        }
      } else if (!state._start && (token.type === Type.ARRAY_END || token.type === Type.OBJECT_END)) {
        // trailing comma
        _stack.pop();
        state = _stack[_stack.length - 1];
      }
      if (
        token.category === Category.WHITESPACE ||
        token.category === Category.COMMENT ||
        token.category === Category.EOF
      )
        return;

      switch (token.category) {
        case Category.NUMBER:
          _feedNumber(token);
          break;
        case Category.STRING:
          _feedString(token);
          break;
        case Category.IDENTIFIER:
          _feedIdentifier(token);
          break;
        case Category.OBJECT:
          _feedObject(token);
          break;
        case Category.ARRAY:
          _feedArray(token);
          break;
        default:
          if (token.done) {
            if (token.category === Category.NULL) _endValue(null);
            else if (token.type === Type.TRUE) _endValue(true);
            else {
              /* console.assert(token.type === Type.FALSE); */
              _endValue(false);
            }
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
  /**
   * Retrieves the parsed JSON value.
   * @returns The parsed JSON value, or `undefined` if parsing is incomplete.
   */
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
    _parser
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
