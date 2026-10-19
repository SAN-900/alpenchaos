#!/usr/bin/env node
// Adds "sideEffects": false to every workspace package so bundlers can drop code the web app never
// imports (game rules, headless reports, validators...). Measured: 11.1 KB -> 7.2 KB gzipped.
// Safe because these packages have no import-time side effects. Idempotent: run it as often as you like.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../packages/", import.meta.url).pathname;
for (const dir of readdirSync(root)) {
  const file = join(root, dir, "package.json");
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, "utf8");
  const pkg = JSON.parse(raw);
  if (pkg.sideEffects === false) continue;
  pkg.sideEffects = false;
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log("marked", dir);
}
