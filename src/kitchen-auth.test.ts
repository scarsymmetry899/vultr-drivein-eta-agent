import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeKitchen } from "./kitchen-auth.ts";

test("kitchen access fails closed when no token is configured", () => {
  assert.equal(authorizeKitchen("anything", ""), "unconfigured");
  assert.equal(authorizeKitchen(undefined, "   "), "unconfigured");
});

test("kitchen access accepts only the configured token", () => {
  assert.equal(authorizeKitchen("pit-token", "pit-token"), "ok");
  assert.equal(authorizeKitchen("pit-token ", "pit-token"), "ok");
  assert.equal(authorizeKitchen("nope", "pit-token"), "denied");
  assert.equal(authorizeKitchen("pit-token-extra", "pit-token"), "denied");
  assert.equal(authorizeKitchen(undefined, "pit-token"), "denied");
});
