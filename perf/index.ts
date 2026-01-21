import { createJsonStreamParser, jsonEventParse, jsonNormalParse, jsonStreamParse } from "../src/index";

const measure = (fn: () => unknown) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

const HEADER = [
  " ".repeat(17),
  "JSON.parse",
  "stream (not save)",
  "steam (save)",
  "event (not save)",
  "event (save)",
  "   normal",
];

const createPrintList = () => {
  const format = (idx: number, item: string | number) => {
    const nitem = typeof item === "string" ? item : item.toFixed(2);
    return nitem.padStart(HEADER[idx].length, " ");
  };

  // @ts-ignore
  if (typeof process === "object") {
    // @ts-ignore
    const write = (str: string): void => void process.stdout.write(str);
    write("|");
    let idx = 0;
    return {
      add: (item: string | number) => write(` ${format(idx++, item)} |`),
      end: () => write("\n"),
    };
  } else {
    const list: string[] = [];
    return {
      add(item: string | number) {
        list.push(format(list.length, item));
      },
      end() {
        console.log(`| ${list.join(" | ")} |`);
        list.length = 0;
      },
    };
  }
};

const printSeparate = () => {
  const list = [""];
  for (const header of HEADER) list.push("-".repeat(header.length + 2));
  list.push("");
  console.log(list.join("+"));
};

printSeparate();
{
  const list = [""];
  for (const header of HEADER) list.push(` ${header} `);
  list.push("");
  console.log(list.join("|"));
}
printSeparate();

const perfArray = () => {
  const s1 = `[${"100,".repeat(1000).slice(0, -1)}],`;
  const s = `[${s1.repeat(2000).slice(0, -1)}]`;

  const printList = createPrintList();
  printList.add("Array");

  printList.add(measure(() => JSON.parse(s)));

  printList.add(
    measure(() => {
      const parser = createJsonStreamParser();
      const token: object = {};
      for (const c of s) parser.feedOneTo(token, c);
    })
  );

  printList.add(
    measure(() => {
      jsonStreamParse(s);
    })
  );

  printList.add(
    measure(() => {
      jsonEventParse(s, { array: { save() {} } });
    })
  );

  printList.add(
    measure(() => {
      jsonEventParse(s, { array: {} });
    })
  );

  printList.add(
    measure(() => {
      jsonNormalParse(s);
    })
  );

  printList.end();
};
const perfObject = () => {
  const TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  const printList = createPrintList();
  printList.add("Object");

  const gen = () => TABLE[(Math.random() * TABLE.length) | 0];
  const genList = (len: number) => {
    const ret: string[] = [];
    for (let i = 0; i < len; ++i) ret.push(gen());
    return ret;
  };

  const s1 = `{${genList(500)
    .map((item) => `"${item}":"${item}"`)
    .join(",")}}`;
  const s = `{${genList(1000)
    .map((item) => `"${item}":${s1}`)
    .join(",")}}`;

  printList.add(measure(() => JSON.parse(s)));

  printList.add(
    measure(() => {
      const parser = createJsonStreamParser();
      const token: object = {};
      for (const c of s) parser.feedOneTo(token, c);
    })
  );

  printList.add(
    measure(() => {
      jsonStreamParse(s);
    })
  );

  printList.add(
    measure(() => {
      jsonEventParse(s, { object: { save() {} } });
    })
  );

  printList.add(
    measure(() => {
      jsonEventParse(s, { object: {} });
    })
  );

  printList.add(
    measure(() => {
      jsonNormalParse(s);
    })
  );

  printList.end();
};
const perfString = () => {
  const list = ['"'];
  for (let i = 0; i < 5000000; ++i) list.push(String.fromCodePoint((Math.random() * (0x10ffff - 0xff) + 0xff) | 0));
  list.push('"');
  const s = list.join("");

  const printList = createPrintList();
  printList.add("String");

  printList.add(measure(() => JSON.parse(s)));

  printList.add(
    measure(() => {
      const parser = createJsonStreamParser();
      const token: object = {};
      for (const c of s) parser.feedOneTo(token, c);
    })
  );

  printList.add(
    measure(() => {
      jsonStreamParse(s);
    })
  );

  printList.add(
    measure(() => {
      jsonEventParse(s, { string: { save() {} } });
    })
  );

  printList.add(
    measure(() => {
      jsonEventParse(s, { string: {} });
    })
  );

  printList.add(
    measure(() => {
      jsonNormalParse(s);
    })
  );

  printList.end();
};
const perfRecursiveArray = () => {
  const s = ["[".repeat(2000000), "1", "]".repeat(2000000)].join("");

  const printList = createPrintList();
  printList.add("Recursive Array");

  printList.add(measure(() => JSON.parse(s)));

  printList.add(
    measure(() => {
      const parser = createJsonStreamParser();
      const token: object = {};
      for (const c of s) parser.feedOneTo(token, c);
    })
  );

  printList.add(
    measure(() => {
      jsonStreamParse(s);
    })
  );

  printList.add(
    measure(() => {
      jsonEventParse(s, { array: { save() {} } });
    })
  );

  printList.add(
    measure(() => {
      jsonEventParse(s, { array: {} });
    })
  );

  printList.add(
    measure(() => {
      jsonNormalParse(s);
    })
  );

  printList.end();
};

perfArray();
perfObject();
perfString();
perfRecursiveArray();

printSeparate();
