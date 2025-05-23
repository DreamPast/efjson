import { jsonPointer, jsonPointerCompile, jsonPointerDecompile, jsonPointerGet } from "efjson";
import { assertEq } from "./util";

{
  const obj = {
    a: { b: [1, 2, 3] },
    c: [],
  };

  assertEq(jsonPointer(obj, "/a"), { b: [1, 2, 3] });
  assertEq(jsonPointer(obj, "/a/b"), [1, 2, 3]);
  assertEq(jsonPointer(obj, "/a/b/0"), 1);

  jsonPointer(obj, "/a/d", 4);
  assertEq((obj as any).a.d, 4);
  jsonPointer(obj, "/a/b/0", 5);
  assertEq((obj as any).a.b[0], 5);
  jsonPointer(obj, "/a/b/-", 6);
  assertEq((obj as any).a.b[3], 6);
}

{
  const obj = {
    "a~b": 1,
    "a/b": 2,
    a: { b: 3 },
    "a~1b": 4,
    "": 5,
  };
  assertEq(jsonPointer(obj, "/a~0b"), 1);
  assertEq(jsonPointer(obj, "/a~1b"), 2);
  assertEq(jsonPointer(obj, "/a/b"), 3);
  assertEq(jsonPointer(obj, "/a~01b"), 4);
  assertEq(jsonPointer(obj, "/"), 5);

  assertEq(jsonPointer({ "": { "": 1 } }, "//"), 1);
}

{
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
}

{
  const obj = {
    foo: ["bar", "baz"],
    highly: {
      nested: {
        objects: true,
      },
    },
  };
  {
    const start = ["foo", "1"];
    assertEq(jsonPointerGet(obj, "0", start), "baz");
    assertEq(jsonPointerGet(obj, "1/0", start), "bar");
    assertEq(jsonPointerGet(obj, "0-1", start), "bar");
    assertEq(jsonPointerGet(obj, "2/highly/nested/objects", start), true);
    assertEq(jsonPointerGet(obj, "0#", start), 1);
    assertEq(jsonPointerGet(obj, "0-1#", start), 0);
    assertEq(jsonPointerGet(obj, "1#", start), "foo");
  }
  {
    const start = ["highly", "nested"];
    assertEq(jsonPointerGet(obj, "0/objects", start), true);
    assertEq(jsonPointerGet(obj, "1/nested/objects", start), true);
    assertEq(jsonPointerGet(obj, "2/foo/0", start), "bar");
    assertEq(jsonPointerGet(obj, "0#", start), "nested");
    assertEq(jsonPointerGet(obj, "1#", start), "highly");
  }
}
