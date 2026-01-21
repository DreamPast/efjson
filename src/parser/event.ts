import { JsonArray, JsonObject, JsonValue } from "../base";
import { JsonOption, JsonParserError, parseJsonNumber } from "./base";
import {
  Category,
  createJsonStreamParser,
  JsonStreamParserBase,
  JsonToken,
  patchJsonStreamParserBase,
  Type,
} from "./stream";

export class JsonEventParserError extends JsonParserError {
  constructor(msg: string) {
    super(msg);
    this.name = "JsonEventParserError";
  }
}

type JsonEventNullReceiver = { save?: (val: null) => void };
type JsonEventBooleanReceiver = { save?: (val: boolean) => void };
type JsonEventIntegerReceiver = { save?: (num: BigInt) => void };
type JsonEventNumberReceiver = { save?: (num: number) => void };
type JsonEventStringReceiver = {
  save?: (str: string) => void;
  append?: (chunk: string) => void;
};
type JsonEventObjectReceiver<Opt extends JsonOption> = {
  save?: (obj: JsonObject) => void;
  set?: (key: string, value: JsonValue) => void;
  next?: () => void;
  keyReceiver?: JsonEventReceiver<Opt>;
  subreceiver?: (key: string) => JsonEventReceiver<Opt>;
};
type JsonEventArrayReceiver<Opt extends JsonOption> = {
  save?: (obj: JsonArray) => void;
  set?: (index: number, value: JsonValue) => void;
  next?: (new_index: number) => void;
  subreceiver?: (index: number) => JsonEventReceiver<Opt>;
};
/**
 * # Event receiver interface.
 *
 * ## sub-types
 * If the fields `null`, `boolean`, `integer`, `number`, `string`, `object`, or `array` are not `undefined`,
 * it means this type is accepted as a valid value.
 *   - If these fields are not defined, all types will be rejected.
 *   - If you want to accept all types, you should provide an object for all these fields;
 *     `JsonDefaultEventReceiver` provides such an object for you.
 *
 * ## `integer` and `number`
 * If `integer` is set, an attempt will be made to convert the value to BigInt and pass it in;
 * if it cannot be converted to an integer, it will fall back to the `number` type.
 *
 * ## order of four basic triggers
 * `start` -> `feed` (may be called multiple times) -> `end` -> `save`
 */
export type JsonEventReceiver<Opt extends JsonOption = JsonOption> = {
  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt>) => void;
  /** If the sub-type's `save` exists, it will be called first; otherwise, this `save` will be called */
  save?: (val: JsonValue) => void;

  null?: JsonEventNullReceiver;
  boolean?: JsonEventBooleanReceiver;
  integer?: JsonEventIntegerReceiver;
  number?: JsonEventNumberReceiver;
  string?: JsonEventStringReceiver;
  object?: JsonEventObjectReceiver<Opt>;
  array?: JsonEventArrayReceiver<Opt>;
};
const _EmptyObject = Object.freeze({});
export const JsonDefaultEventReceiver: JsonEventReceiver<any> = Object.freeze({
  null: _EmptyObject,
  boolean: _EmptyObject,
  number: _EmptyObject,
  string: _EmptyObject,
  object: _EmptyObject,
  array: _EmptyObject,
});

namespace EventState {
  type _StateBase<Opt extends JsonOption> = {
    _receiver: JsonEventReceiver<Opt>;
    _start: boolean;
  };

  export type _StateLess<Opt extends JsonOption> = _StateBase<Opt> & {};
  export type _Number<Opt extends JsonOption> = _StateBase<Opt> & {
    _save: boolean;
    _list: string[];
  };
  export type _String<Opt extends JsonOption> = _StateBase<Opt> & {
    _append?: (chunk: string) => void;

    _save?: boolean;
    _list: string[];
  };

  export type _Object<Opt extends JsonOption> = _StateBase<Opt> & {
    _set?: (key: string, value: JsonValue) => void;
    _next?: () => void;
    _keyReceiver?: JsonEventReceiver<Opt>;
    _subreceiver?: (key: string) => JsonEventReceiver<Opt>;

    _saveChild: boolean;
    _child?: JsonValue;
    _key?: string;

    _save: boolean;
    _saveKey: boolean;
    _saveValue: boolean;
    _object: JsonObject | boolean;
  };
  export type _Array<Opt extends JsonOption> = _StateBase<Opt> & {
    _set?: (index: number, value: JsonValue) => void;
    _next?: (new_index: number) => void;
    _subreceiver?: (index: number) => JsonEventReceiver<Opt>;

    _saveChild: boolean;
    _child?: JsonValue;
    _index: number;

    _save: boolean;
    _array: JsonArray | boolean;
  };
  export type _Struct<Opt extends JsonOption> = _Object<Opt> | _Array<Opt>;

  export type _State<Opt extends JsonOption> = _StateLess<Opt> | _Number<Opt> | _String<Opt> | _Struct<Opt>;
}

const parseJsonInteger_bigint = (str: string): bigint | undefined => {
  try {
    if (str[0] === "-") {
      str = str.slice(1);
      // only decimal "-0" is treated as not an integer
      if (str === "0") return undefined;
      return -BigInt(str);
    } else {
      if (str[0] === "+") str = str.slice(1);
      return BigInt(str);
    }
  } catch {
    return undefined;
  }
};
/*
// if bigint is not available, use this function
const parseJsonInteger_number = (str: string): number | undefined => {
  let sign = false;
  if (str[0] === "-") {
    str = str.slice(1);
    // only decimal "-0" is treated as not an integer
    if (str === "0") return undefined;
    sign = true;
  } else if (str[0] === "+") str = str.slice(1);

  let ret: number;
  if (str.search(/[eE]/) !== -1) {
    // 'e' or 'E' is integer if it's hexadecimal
    if (str.length >= 3 && str[0] === "0" && (str[1] === "x" || str[1] === "X")) ret = +str;
    else return undefined;
  } else ret = +str;
  if (Number.isInteger(ret)) return sign ? -ret : ret;
  return undefined;
};
*/
const parseJsonInteger = parseJsonInteger_bigint;

/**
 * Input tokens and emit events
 */
export interface JsonEventEmitter<Opt extends JsonOption = JsonOption> {
  feed: (token: JsonToken<Opt>) => void;
}
export const createJsonEventEmitter = <Opt extends JsonOption = JsonOption>(
  receiver: JsonEventReceiver<Opt>
): JsonEventEmitter<Opt> => {
  const stack: EventState._State<Opt>[] = [{ _receiver: receiver, _start: false }];

  const enum SpecialParse {
    None = 0,
    Identifier = 1,
    Number = 2,
  }
  let spec = SpecialParse.None;

  function _throw(msg: string): never {
    throw new JsonEventParserError(`JsonEventParser Error - ${msg}`);
  }

  const _endValue = (value: JsonValue, save: undefined | ((val: any) => void)): void => {
    const state = stack.pop()!;
    state._receiver.end?.();
    if (save) save(value);
    else state._receiver.save?.(value);
    if (stack.length !== 0) (stack[stack.length - 1] as EventState._Struct<Opt>)._child = value;
  };
  const _needSave = () => (stack[stack.length - 2] as undefined | EventState._Struct<Opt>)?._saveChild;

  const _feedStateless = (token: JsonToken<Opt> & { category: Category.BOOLEAN | Category.NULL }) => {
    const state = stack[stack.length - 1];
    if (!state._start) {
      const type = token.category === Category.NULL ? "null" : "boolean";
      if (!state._receiver[type]) _throw(`${type} is rejected`);
      state._start = true;
      state._receiver.start?.();
    }
    state._receiver.feed?.(token);
    if (token.done) {
      return _endValue(
        token.category === Category.NULL ? null : token.type === Type.TRUE,
        state._receiver[token.category === Category.NULL ? "null" : "boolean"]?.save
      );
    }
  };
  const _feedNumber = (token: JsonToken<Opt> & { category: Category.NUMBER }) => {
    const state = stack[stack.length - 1] as EventState._Number<Opt>;
    if (!state._start) {
      if (!state._receiver["number"] && !state._receiver["integer"]) _throw(`number is rejected`);
      state._save =
        _needSave() || !!state._receiver.save || !!state._receiver.integer?.save || !!state._receiver.number?.save;
      state._list = [];

      spec = SpecialParse.Number;
      state._start = true;
      state._receiver.start?.();
    }
    if (state._save) state._list.push(token.character);
    state._receiver.feed?.(token);
  };
  const _feedString = (token: JsonToken<Opt> & { category: Category.STRING }) => {
    const state = stack[stack.length - 1] as EventState._String<Opt>;
    if (!state._start) {
      const _subreceiver = state._receiver["string"];
      if (!_subreceiver) _throw(`string is rejected`);
      state._save = _needSave() || !!(state._receiver.save || _subreceiver.save);
      state._list = [];
      state._append = _subreceiver.append;

      state._start = true;
      state._receiver.start?.();
    }
    state._receiver.feed?.(token);
    if (token.type === Type.STRING_NORMAL) {
      state._append?.(token.character);
      if (state._save) state._list.push(token.character);
    } else if (
      token.type === Type.STRING_ESCAPE ||
      token.type === Type.STRING_ESCAPE_UNICODE ||
      token.type === Type.STRING_ESCAPE_HEX
    ) {
      if (token.escaped !== undefined) {
        state._append?.(token.escaped);
        if (state._save) state._list.push(token.escaped);
      }
    } else if (token.type === Type.STRING_END) {
      _endValue(state._list.join(""), state._receiver["string"]?.save);
    }
  };
  const _feedIdentifier = (token: JsonToken<Opt> & { category: Category.IDENTIFIER }) => {
    const state = stack[stack.length - 1] as EventState._String<Opt>;
    if (!state._start) {
      const _subreceiver = state._receiver["string"];
      if (!_subreceiver) _throw(`string is rejected`);
      state._save = _needSave() || !!state._receiver.save || !!_subreceiver.save;
      state._list = [];
      state._append = _subreceiver.append;

      spec = SpecialParse.Identifier;
      state._start = true;
      state._receiver.start?.();

      if (state._receiver.feed)
        state._receiver.feed({
          category: Category.STRING,
          type: Type.STRING_START,
          character: '"',
          index: 0,
        });
    }
    if (token.type === Type.IDENTIFIER_NORMAL) {
      if (state._receiver.feed)
        state._receiver.feed({
          category: Category.STRING,
          type: Type.STRING_NORMAL,
          character: token.character,
          index: 0,
        });
      state._append?.(token.character);
      if (state._save) state._list.push(token.character);
    } else if (token.type === Type.IDENTIFIER_ESCAPE_START) {
      if (state._receiver.feed)
        state._receiver.feed({
          category: Category.STRING,
          type: token.index === 0 ? Type.STRING_ESCAPE_START : Type.STRING_ESCAPE_UNICODE_START,
          character: token.character,
          index: 0,
        });
    } else {
      /* console.assert(token.type === Type.IDENTIFIER_ESCAPE); */
      if (state._receiver.feed)
        state._receiver.feed({
          category: Category.STRING,
          type: Type.STRING_ESCAPE_UNICODE,
          index: token.index as any,
          escaped: token.escaped as any,
          character: token.character,
          done: true,
        });
      if (token.escaped !== undefined) {
        state._append?.(token.escaped);
        if (state._save) state._list.push(token.escaped);
      }
    }
  };
  const _feedObject = (token: JsonToken<Opt> & { category: Category.OBJECT }) => {
    const state = stack[stack.length - 1] as EventState._Object<Opt>;
    if (!state._start) {
      const _subreceiver = state._receiver["object"];
      if (!_subreceiver) _throw(`object is rejected`);
      state._save = _needSave() || !!state._receiver.save || !!_subreceiver.save;
      state._saveValue = state._save || !!_subreceiver.set;
      state._saveKey = state._saveValue || !!_subreceiver.keyReceiver?.save || !!_subreceiver.keyReceiver?.string?.save;

      state._object = state._save && {};
      state._set = _subreceiver.set;
      state._next = _subreceiver.next;
      state._keyReceiver = _subreceiver.keyReceiver;
      state._subreceiver = _subreceiver.subreceiver;

      state._start = true;
      state._receiver.start?.();
      state._receiver.feed?.(token);

      state._saveChild = state._saveKey;
      stack.push({
        _receiver: state._keyReceiver ?? JsonDefaultEventReceiver,
        _start: false,
      } as EventState._String<Opt>);
      state._receiver.feed?.(token);
      return;
    }
    state._receiver.feed?.(token);
    /* console.assert(token.type !== Type.OBJECT_START); */
    if (token.type === Type.OBJECT_END) {
      if (state._key !== undefined) {
        // trailing comma
        if (state._save) (state._object as JsonObject)[state._key] = state._child!;
        state._set?.(state._key, state._child!);
      }
      _endValue(state._object!, state._receiver["object"]?.save);
    } else if (token.type === Type.OBJECT_NEXT) {
      if (state._save) (state._object as JsonObject)[state._key!] = state._child!;
      state._set?.(state._key!, state._child!);
      state._next?.();

      state._key = state._child = undefined;
      state._saveChild = state._saveKey;
      stack.push({
        _receiver: state._keyReceiver ?? JsonDefaultEventReceiver,
        _start: false,
      } as EventState._String<Opt>);
    } else {
      /* console.assert(token.type === Type.OBJECT_VALUE_START); */
      state._saveChild = state._saveValue;
      const key = state._child as string | undefined;
      state._key = key;
      stack.push({
        _receiver: (key != undefined && state._subreceiver?.(key)) || JsonDefaultEventReceiver,
        _start: false,
      });
    }
  };
  const _feedArray = (token: JsonToken<Opt> & { category: Category.ARRAY }): void => {
    const state = stack[stack.length - 1] as EventState._Array<Opt>;
    if (!state._start) {
      const _subreceiver = state._receiver["array"];
      if (!_subreceiver) _throw(`array is rejected`);
      state._save = _needSave() || !!state._receiver.save || !!_subreceiver.save;
      state._saveChild = state._save || !!_subreceiver.set;

      state._index = 0;
      state._array = state._save && [];
      state._set = _subreceiver.set;
      state._next = _subreceiver.next;
      state._subreceiver = _subreceiver.subreceiver;

      state._start = true;
      state._receiver.start?.();
      state._receiver.feed?.(token);

      stack.push({ _receiver: state._subreceiver?.(state._index) ?? JsonDefaultEventReceiver, _start: false });
      return;
    }
    state._receiver.feed?.(token);
    /* console.assert(token.type !== Type.ARRAY_START); */
    if (token.type === Type.ARRAY_END) {
      if (state._child !== undefined) {
        if (state._save) (state._array as JsonArray)[state._index] = state._child!; // trailing comma
        state._set?.(state._index, state._child!);
      }
      _endValue(state._array, state._receiver["array"]?.save);
    } else {
      /* console.assert(token.type === Type.ARRAY_NEXT); */
      if (state._save) (state._array as JsonArray)[state._index] = state._child!;
      state._set?.(state._index, state._child!);
      state._child = undefined;
      ++state._index;
      state._next?.(state._index);
      stack.push({ _receiver: state._subreceiver?.(state._index) ?? JsonDefaultEventReceiver, _start: false });
    }
  };

  return {
    feed(token: JsonToken<Opt>) {
      let state = stack[stack.length - 1];
      if (state === undefined) return;
      if (spec) {
        if (spec === SpecialParse.Number) {
          if (token.category !== Category.NUMBER) {
            if ((state as EventState._Number<Opt>)._save) {
              stack.pop();
              const str = (state as EventState._Number<Opt>)._list.join("");
              let saveFloat = true;
              if (state._receiver["integer"]) {
                const val = parseJsonInteger(str);
                if (val !== undefined) {
                  state._receiver.end?.();
                  state._receiver["integer"].save?.(val);
                  saveFloat = false;
                } else if (!state._receiver["number"] && !state._receiver.save) _throw(`invalid integer: ${str}`);
              }

              const value = parseJsonNumber(str);
              if (saveFloat) {
                state._receiver.end?.();
                const func = state._receiver["number"]?.save;
                if (func) func(value);
                else state._receiver.save?.(value);
              }
              if (stack.length !== 0) (stack[stack.length - 1] as EventState._Struct<Opt>)._child = value;
            } else stack.pop()!._receiver.end?.();
            spec = SpecialParse.None;
            state = stack[stack.length - 1];
          }
        } else {
          if (token.category !== Category.IDENTIFIER) {
            if (state._receiver.feed)
              state._receiver.feed({
                category: Category.STRING,
                type: Type.STRING_END,
                character: '"',
                index: 0,
              });
            if ((state as EventState._String<Opt>)._save) {
              _endValue((state as EventState._String<Opt>)._list.join(""), state._receiver["string"]?.save);
            } else stack.pop()!._receiver.end?.();
            spec = SpecialParse.None;
            state = stack[stack.length - 1];
          }
        }
      } else if (!state._start && (token.type === Type.OBJECT_END || token.type === Type.ARRAY_END)) {
        // trailing comma
        stack.pop();
        state = stack[stack.length - 1];
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
          _feedStateless(token);
      }
    },
  };
};

export const jsonEventEmit = <Opt extends JsonOption = JsonOption>(
  tokens: Iterable<JsonToken<Opt>>,
  receiver: JsonEventReceiver<Opt>
) => {
  const emitter = createJsonEventEmitter(receiver);
  for (const token of tokens) emitter.feed(token);
};

/**
 * Input JSON string and emit events (equivalent to combine `JsonStreamParser` and `JsonEventEmiiter`)
 */
export interface JsonEventParser extends JsonStreamParserBase {
  feed: (s: string) => void;
  end: () => void;
}
export const createJsonEventParser = <Opt extends JsonOption = JsonOption>(
  receiver: JsonEventReceiver<Opt>,
  option?: Opt
): JsonEventParser => {
  const _parser = createJsonStreamParser(option);
  const _emitter = createJsonEventEmitter(receiver);
  const _token = {};
  return patchJsonStreamParserBase(
    {
      feed(s: string) {
        for (const c of s) _emitter.feed(_parser.feedOneTo(_token, c));
      },
      end() {
        _emitter.feed(_parser.end());
      },
    },
    _parser
  );
};

export const jsonEventParse = <Opt extends JsonOption = JsonOption>(
  str: string,
  receiver: JsonEventReceiver<Opt>,
  option?: Opt
) => {
  const emitter = createJsonEventEmitter(receiver);
  const baseParser = createJsonStreamParser(option);
  const token = {};
  for (const c of str) emitter.feed(baseParser.feedOneTo(token, c));
  emitter.feed(baseParser.end());
};
