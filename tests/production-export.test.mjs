import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);
const outputExists = existsSync(outputRoot);

test(
  "production export contains the playable Russian game shell",
  { skip: outputExists ? false : "run `pnpm build` before the production smoke test" },
  async () => {
    const html = await readFile(new URL("index.html", outputRoot), "utf8");
    assert.match(html, /<html[^>]*\blang=["']ru["']/i);
    assert.match(html, /<title>Горн — кузница<\/title>/i);
    assert.match(html, /Горн/);
    assert.match(html, /class=["']app-shell["']/);
    assert.match(html, /ЗАГРУЗКА…/);

    const staticEntries = await readdir(new URL("_next/static/", outputRoot), { recursive: true });
    let found = false;
    for (const file of staticEntries.filter((entry) => entry.endsWith(".js"))) {
      const source = await readFile(new URL(`_next/static/${file}`, outputRoot), "utf8");
      if (source.includes("start-play") && source.includes("К горну")) {
        found = true;
        break;
      }
    }
    assert.equal(found, true);
  },
);

test(
  "production export includes local assets",
  { skip: outputExists ? false : "run `pnpm build` before the production smoke test" },
  async () => {
    const html = await readFile(new URL("index.html", outputRoot), "utf8");
    assert.match(html, /\/_next\/static\/[^"']+\.js/);
    assert.match(html, /\/_next\/static\/[^"']+\.css/);
  },
);
