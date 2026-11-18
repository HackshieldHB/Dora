/**
 * RELEASE BUILD STEP (runs inside the Docker builder, before sign-integrity).
 * Obfuscates the compiled server-side JavaScript of the standalone build, which is where the
 * business logic (payroll, PPh 21 / BPJS, approval workflows, licensing) lives.
 *
 *   tsx scripts/release/obfuscate.ts --root .next/standalone
 *
 * Settings are deliberately conservative: string-array encoding and identifier mangling make the
 * code much harder to read or feed to an AI for analysis, while transforms known to break or slow
 * down server code (control-flow flattening, dead-code injection, self-defending, debug traps,
 * object-key renaming) stay off. Obfuscation raises the cost of reverse engineering; it does not
 * make it impossible — the license, integrity check and contract are the other layers.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";

function option(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const root = path.resolve(option("root") || ".next/standalone");
const server = path.join(root, ".next", "server");

/** Next.js bookkeeping files that must stay byte-for-byte as generated, and the Edge middleware. */
function skip(relative: string): boolean {
  const name = path.basename(relative);
  return (
    name.endsWith("-manifest.js") ||
    name.endsWith("_client-reference-manifest.js") ||
    name === "webpack-runtime.js" ||
    name === "webpack-api-runtime.js" ||
    relative.startsWith("edge-") ||
    relative.startsWith("src/middleware") ||
    relative.startsWith("middleware") ||
    relative.startsWith("pages/")
  );
}

const targets = walk(server)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({ file, relative: path.relative(server, file).split(path.sep).join("/") }))
  .filter(({ relative }) => (relative.startsWith("app/") || relative.startsWith("chunks/")) && !skip(relative));

// Bundled operations tools (setup, encrypt-data, backup, restore) shipped next to server.js.
const tools = path.join(root, "tools");
try {
  for (const file of walk(tools)) if (file.endsWith(".js")) targets.push({ file, relative: path.relative(root, file).split(path.sep).join("/") });
} catch {
  // No tools folder in this build.
}

let before = 0;
let after = 0;
const started = Date.now();
for (const { file, relative } of targets) {
  const source = readFileSync(file, "utf8");
  const result = JavaScriptObfuscator.obfuscate(source, {
    target: "node",
    compact: true,
    simplify: true,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    renameProperties: false,
    transformObjectKeys: false,
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: ["base64"],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayIndexShift: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersType: "variable",
    stringArrayCallsTransform: false,
    splitStrings: false,
    ignoreImports: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    numbersToExpressions: false,
    unicodeEscapeSequence: false,
    sourceMap: false,
    seed: 0,
  });
  const code = result.getObfuscatedCode();
  writeFileSync(file, code);
  before += source.length;
  after += code.length;
  if (process.env.DORA_OBFUSCATE_VERBOSE) console.log(`obfuscated ${relative}`);
}
console.log(`Obfuscated ${targets.length} server files (${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB) in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
