import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as engine from "../app/game-engine.ts";
import { createSaveCoordinator } from "../app/save-coordinator.ts";

// Production JSX event bodies and onTap/commitSave execute against the actual
// save coordinator/engine. This is controlled handler evidence, not native UI.
const source = ts.createSourceFile("page.tsx", fs.readFileSync(process.env.GORN_INPUT_SOURCE_PATH ?? new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map(); const events = new Map();
function walk(node) {
  if (ts.isVariableDeclaration(node) && ["onTap", "commitSave"].includes(node.name.getText(source))) {
    functions.set(node.name.getText(source), ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer);
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "button" && node.attributes.getText(source).includes("anvil-btn")) {
    for (const prop of node.attributes.properties) if (ts.isJsxAttribute(prop) && prop.name.getText(source).startsWith("on")) events.set(prop.name.getText(source), prop.initializer.expression);
  }
  ts.forEachChild(node, walk);
}
walk(source);
function evaluate(node, scope) {
  assert.ok(node, "actual production handler exists");
  const code = ts.transpileModule(`const fn = ${node.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(...Object.keys(scope), `${code}\nreturn fn;`)(...Object.values(scope));
}
function fixture() {
  let raw = engine.serializeSave(engine.createDefaultSave()); const state = engine.migrateSave(raw); const saveRef = { current: state }; const pending = []; const timers = [];
  const coordinator = createSaveCoordinator({ read: () => raw, write: value => { raw = value; return true; }, parse: value => engine.migrateSave(value), serialize: engine.serializeSave });
  coordinator.initialize(raw, state);
  const applySave = next => { Object.assign(state, next); saveRef.current = state; };
  const policy = { isBusy: () => false, startGameplay() {} }; const noop = () => {};
  const scope = { ...engine, saveRef, paused: false, resetPendingRef: { current: false }, getAdPolicy: () => policy, getSaveCoordinator: () => coordinator, applySave,
    readStoredValue: () => raw, SAVE_KEY: "keyboard", VK_SAVE_KEY: "keyboard_cloud", bridgeRef: { current: null }, playSound: noop,
    window: { setTimeout: fn => { timers.push(fn); return timers.length; } } };
  for (const key of ["Heat", "FloatText", "FloatCrit", "Hit", "CritHit", "Sparking"]) {
    const name = key[0].toLowerCase() + key.slice(1); scope[`set${key}`] = value => { state[name] = typeof value === "function" ? value(state[name] ?? 0) : value; };
  }
  scope.commitSave = evaluate(functions.get("commitSave"), scope);
  scope.onTap = () => { const promise = evaluate(functions.get("onTap"), scope)(); pending.push(promise); return promise; };
  return { state, scope, policy, timers, saved: () => engine.migrateSave(raw), fire: (name, event = {}) => { const node = events.get(name); if (node) return evaluate(node, scope)(event); }, async flush() { await Promise.all(pending); } };
}
function keyEvent(key, repeat = false) { return { key, repeat, prevented: false, preventDefault() { this.prevented = true; } }; }

test("actual anvil Enter/Space press each credits exactly one saved tap without synthesized-click double reward", async () => {
  const oldRandom = Math.random; Math.random = () => 0.9;
  try { for (const key of ["Enter", " "]) {
    const f = fixture(); const event = keyEvent(key); f.fire("onKeyDown", event); await f.flush();
    assert.equal(event.prevented, true); assert.equal(f.saved().stats.taps, 1); assert.equal(f.saved().daily.tap, 1); assert.equal(f.saved().ingots, 1);
    f.fire("onKeyUp", keyEvent(key)); f.fire("onClick", { detail: 0 }); await f.flush();
    assert.equal(f.saved().stats.taps, 1); assert.equal(f.saved().ingots, 1);
  } } finally { Math.random = oldRandom; }
});

test("actual keyboard hold ignores repeat and guarded pause/ad/reset prevent resource changes", async () => {
  const oldRandom = Math.random; Math.random = () => 0.9;
  try {
    const f = fixture(); f.fire("onKeyDown", keyEvent("Enter"));
    for (let i = 0; i < 20; i++) { const event = keyEvent("Enter", true); f.fire("onKeyDown", event); assert.equal(event.prevented, true); }
    await f.flush(); assert.equal(f.saved().stats.taps, 1);
    f.fire("onKeyDown", keyEvent("ArrowLeft")); await f.flush(); assert.equal(f.saved().stats.taps, 1);
    for (const blocker of ["paused", "ad", "reset"]) {
      const blocked = fixture(); if (blocker === "paused") blocked.scope.paused = true;
      if (blocker === "ad") blocked.policy.isBusy = () => true;
      if (blocker === "reset") blocked.scope.resetPendingRef.current = true;
      for (const key of ["Enter", " "]) blocked.fire("onKeyDown", keyEvent(key));
      await blocked.flush(); assert.equal(blocked.saved().ingots, 0); assert.equal(blocked.saved().stats.taps, 0);
    }
  } finally { Math.random = oldRandom; }
});

test("actual pointer press/hold/release still credits only once, with no mouse-click duplication", async () => {
  const f = fixture(); const oldRandom = Math.random; Math.random = () => 0.9;
  try {
    f.fire("onPointerDown", { pointerType: "touch" }); await f.flush(); assert.equal(f.saved().stats.taps, 1);
    for (const timer of f.timers) timer(); f.fire("onPointerUp"); f.fire("onLostPointerCapture"); f.fire("onClick", { detail: 1 }); await f.flush();
    assert.equal(f.saved().stats.taps, 1); assert.equal(f.saved().ingots, 1);
  } finally { Math.random = oldRandom; }
});
