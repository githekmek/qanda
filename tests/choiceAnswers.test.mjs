import test from "node:test";
import assert from "node:assert/strict";
import { parseMultipleAnswer, answersMatch, answerLabels, matchingAnswerPositions } from "../src/lib/choiceAnswers.mjs";

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

test("eight options support the last option and every selection without changing old questions", () => {
  const options = ["A","B","C","D","E","F","G","H"];
  assert.deepEqual(parseMultipleAnswer("[7]", 8), [7]);
  assert.deepEqual(parseMultipleAnswer("[7,6,5,4,3,2,1,0]", 8), [0,1,2,3,4,5,6,7]);
  assert.equal(parseMultipleAnswer("[8]", 8), null);
  assert.equal(parseMultipleAnswer("[7,7]", 8), null);
  assert.equal(parseMultipleAnswer("[7]", 5), null);
  assert.equal(answersMatch("MULTIPLE_SELECT", "[7,0]", "[0,7]", 8), true);
  assert.deepEqual(answerLabels("MULTIPLE_SELECT", options, "[7,0]"), ["A","H"]);
  assert.deepEqual(answerLabels("MULTIPLE_CHOICE", options, "7"), ["H"]);
});

test("individual matches use option indices and include a single shared selection", () => {
  assert.deepEqual(matchingAnswerPositions("[2,0]", "[0,1]", 3), [true, false]);
  assert.deepEqual(matchingAnswerPositions("[0,1]", "[2,0]", 3), [true, false]);
  assert.deepEqual(matchingAnswerPositions("[1]", "[0,1]", 2), [true]);
  assert.deepEqual(matchingAnswerPositions("[0]", "[1]", 2), [false]);
  assert.deepEqual(matchingAnswerPositions("[0,1]", undefined, 2), [false, false]);
});
