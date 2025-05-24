import license from "rollup-plugin-license";
import dts from "rollup-plugin-dts";

const bannerContent = `/**
 * @module efjson
 * @version ${process.env.npm_package_version}
 * @author Jin Cai
 * @license MIT
 */
/** */`;

export default [
  {
    input: "tmp/dist/index.js",
    output: { file: "lib/efjson.mjs", format: "es" },
    plugins: [
      license({
        banner: { content: bannerContent },
      }),
    ],
  },
  {
    input: "tmp/dist/index.d.ts",
    output: [{ file: "lib/efjson.d.ts", format: "es" }],
    plugins: [dts()],
  },
];
