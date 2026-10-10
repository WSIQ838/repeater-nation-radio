import { build } from "esbuild";
import { writeFileSync } from "node:fs";
const out = new URL("../com.repeaternation.radio.sdPlugin/bin/", import.meta.url).pathname;
await build({
  entryPoints: [new URL("../src/plugin.js", import.meta.url).pathname],
  outfile: out + "plugin.js", bundle: true, platform: "node", target: "node20", format: "esm",
  external: ["bufferutil", "utf-8-validate"],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  minify: false, sourcemap: false,
});
// The Stream Deck app runs bin/plugin.js as an ES module.
writeFileSync(out + "package.json", JSON.stringify({ type: "module" }) + "\n");
console.log("built bin/plugin.js");
