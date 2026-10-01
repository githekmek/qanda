import test from "node:test";
import assert from "node:assert/strict";
import { parseMultipleAnswer, answersMatch, answerLabels } from "../src/lib/choiceAnswers.mjs";

test("multiple answers require unique integer indices within the available options", () => {
  assert.deepEqual(parseMultipleAnswer("[4,0,2]", 5), [0,2,4]);
  assert.deepEqual(parseMultipleAnswer("[0]", 2), [0]);
  assert.deepEqual(parseMultipleAnswer("[0,1,2,3,4]", 5), [0,1,2,3,4]);
  for (const value of ["[]", "[0,0]", "[-1]", "[5]", "[1.5]", '["1"]', "null", "{}", "0", "[true]", "bad"]) {
    assert.equal(parseMultipleAnswer(value, 5), null, value);
  }
});

test("matching is set equality and does not change legacy answer semantics", () => {
  assert.equal(answersMatch("MULTIPLE_SELECT", "[2,0]", "[0,2]", 3), true);
  assert.equal(answersMatch("MULTIPLE_SELECT", "[0,2]", "[0]", 3), false);
  assert.equal(answersMatch("MULTIPLE_SELECT", "[]", "[]", 3), false);
  assert.equal(answersMatch("MULTIPLE_CHOICE", "1", "1", 3), true);
  assert.equal(answersMatch("TEXT", "Hello", "hello", 0), false);
  assert.deepEqual(answerLabels("MULTIPLE_SELECT", ["A","B","C"], "[2,0]"), ["A","C"]);
  assert.deepEqual(answerLabels("MULTIPLE_CHOICE", ["A","B"], "1"), ["B"]);
  assert.deepEqual(answerLabels("TEXT", null, "[0,2]"), ["[0,2]"]);
  assert.deepEqual(answerLabels("MULTIPLE_SELECT", ["A","B"], undefined), []);
});
