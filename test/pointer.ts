import { jsonPointerCompile, jsonPointerDecompile, JsonValue } from "../src/index";
import { assertEq, checkPointerGet, checkPointerSet } from "./_util";

describe("pointer", () => {
  test("absolute", () => {
    {
      const obj = {
        a: { b: [1, 2, 3] },
        c: [],
      };

      checkPointerGet({ b: [1, 2, 3] }, obj, "/a");
      checkPointerGet([1, 2, 3], obj, "/a/b");
      checkPointerGet(1, obj, "/a/b/0");

      checkPointerSet(() => (obj as any).a.d, obj, "/a/d", 4);
      checkPointerSet(() => (obj as any).a.b[0], obj, "/a/b/0", 5);
      checkPointerSet(() => (obj as any).a.b[3], obj, "/a/b/-", 6);

      checkPointerSet(() => (obj as any).a.d, obj, ["a", "d"], 7);
      checkPointerSet(() => (obj as any).a.b[0], obj, ["a", "b", "0"], 8);
      checkPointerSet(() => (obj as any).a.b[4], obj, ["a", "b", "-"], 9);

      checkPointerSet(undefined, obj, "", 0);
      checkPointerSet(undefined, 1, "/", 0);
    }
    {
      const obj = {
        "a~b": 1,
        "a/b": 2,
        a: { b: 3 },
        "a~1b": 4,
        "": 5,
      };
      checkPointerGet(1, obj, "/a~0b");
      checkPointerGet(2, obj, "/a~1b");
      checkPointerGet(3, obj, "/a/b");
      checkPointerGet(4, obj, "/a~01b");
      checkPointerGet(5, obj, "/");

      checkPointerGet(1, { "": { "": 1 } }, "//");
    }
    checkPointerGet(undefined, [], `/${Number.MAX_SAFE_INTEGER * 2}`);
  });

  test("compile", () => {
    const tab: [string, string[]][] = [
      ["", []],
      ["/", [""]],
      ["//", ["", ""]],
      ["/a", ["a"]],
      ["/a/b", ["a", "b"]],
      ["/a~0b", ["a~b"]],
      ["/a~1b", ["a/b"]],
      ["/a~01b", ["a~1b"]],
    ];
    for (const [input, output] of tab) {
      assertEq(jsonPointerCompile(input), output);
      assertEq(jsonPointerDecompile(output), input);
    }
    checkPointerGet(undefined, {}, "/~2");
    checkPointerGet(undefined, [1], "0");
    checkPointerGet(undefined, [], "/-");
  });

  test("relative_example", () => {
    const obj = {
      foo: ["bar", "baz"],
      highly: {
        nested: {
          objects: true,
        },
      },
    };
    for (const start of [["foo", "1"], "/foo/1"]) {
      checkPointerGet("baz", obj, "0", start);
      checkPointerGet("bar", obj, "1/0", start);
      checkPointerGet("bar", obj, "0-1", start);
      checkPointerGet(true, obj, "2/highly/nested/objects", start);
      checkPointerGet(1, obj, "0#", start);
      checkPointerGet(0, obj, "0-1#", start);
      checkPointerGet("foo", obj, "1#", start);
    }
    for (const start of [["highly", "nested"], "/highly/nested"]) {
      checkPointerGet(true, obj, "0/objects", start);
      checkPointerGet(true, obj, "1/nested/objects", start);
      checkPointerGet("bar", obj, "2/foo/0", start);
      checkPointerGet("nested", obj, "0#", start);
      checkPointerGet("highly", obj, "1#", start);
    }
  });

  test("relative", () => {
    {
      const obj: JsonValue = [
        {
          a: 1,
          b: 2,
        },
        { c: { d: 3, e: 4 } },
      ];
      checkPointerGet(3, obj, ["c", "d"], ["1"]);
      checkPointerGet(3, obj, ["c", "d"], "/1");
      checkPointerGet(3, obj, "0/c/d", ["1"]);
      checkPointerGet(3, obj, "0/c/d", "/1");
      checkPointerGet(3, obj, "0+0/c/d", "/1");
      checkPointerGet(3, obj, "/1/c/d", ["1"]);
      checkPointerGet(3, obj, "/1/c/d", "/1");

      checkPointerGet(1, obj, "0#", "/1");
      checkPointerGet(1, obj, "0#", ["1"]);
      checkPointerGet(1, obj, "1#", "/1/c");
      checkPointerGet(1, obj, "1#", ["1", "c"]);

      checkPointerSet(() => (obj as any)[1].c.d, obj, "0/c/d", 12, ["1"]);
      checkPointerSet(() => (obj as any)[1].c.d, obj, "0/c/d", 13, "/1");
      checkPointerSet(() => (obj as any)[1].c.d, obj, "0+0/c/d", 14, "/1");
      checkPointerSet(() => (obj as any)[1].c.d, obj, "/1/c/d", 15, ["1"]);
      checkPointerSet(() => (obj as any)[1].c.d, obj, "/1/c/d", 16, "/1");

      checkPointerSet(undefined, obj, "0#", 0, "/1");
      checkPointerSet(undefined, obj, "0", 0, "");
    }
    {
      const obj: JsonValue = [4, 3, [2, 1]];
      checkPointerGet(undefined, obj, ["z"]);
      checkPointerGet(undefined, obj, "/~2");
      checkPointerGet(undefined, obj, "/4");

      checkPointerGet(undefined, obj, "1#", "");
      checkPointerGet(undefined, obj, "1#2", "");
      checkPointerGet(undefined, obj, "0+#", "/0");
      checkPointerGet(undefined, obj, "1+1#", "/0");
      checkPointerGet(3, obj, "0#", "/-");
      checkPointerGet(2, obj, "0-1#", "/-");
      checkPointerGet(undefined, obj, "0-1#1", "/-");
      checkPointerGet(undefined, obj, "1#", "/-");
      checkPointerGet(undefined, 1, "0#", "/-");
      checkPointerGet(undefined, 1, "0+0#", "/-");
      checkPointerGet(undefined, [], "0+1#", "/-");

      checkPointerGet(2, obj, "0", "/2/0");
      checkPointerGet(1, obj, "0+1", "/2/0");
      checkPointerGet(3, obj, "1-1", "/2/0");
      checkPointerGet([2, 1], obj, "1-0", "/2/0");
      checkPointerGet(1, obj, "0-1", "/2/-");
      checkPointerGet(undefined, obj, "0-0", "/2/-");
      checkPointerGet(undefined, obj, "0-0", "/2/0/0");

      checkPointerSet(() => (obj as any)[3], obj, "0/-", 10, "");
      checkPointerSet(undefined, obj, "0/a", 10, "");
      checkPointerSet(() => (obj as any)[3], obj, "0-1", 11, "/-");
      checkPointerSet(undefined, obj, "0+1", 11, "/-");
    }
    {
      const obj: JsonValue = { a: 1, b: 2, c: 3 };
      checkPointerGet(undefined, obj, "/d");
    }
    {
      const obj = "#";
      checkPointerGet(undefined, obj, "/");
      checkPointerGet(obj, obj, "0", "");
      checkPointerGet(undefined, obj, "1", "");
      checkPointerGet(obj, obj, "1", "/");

      checkPointerSet(undefined, obj, "0/-", 10, "");
      checkPointerSet(undefined, obj, "0+0", 10, "/-");
    }
    {
      checkPointerGet(1, [1], "+0", "/0");
    }
  });
});
