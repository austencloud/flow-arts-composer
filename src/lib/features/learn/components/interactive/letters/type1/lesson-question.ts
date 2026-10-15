// Invalid saved progress must still open a question the learner can answer.
export function lessonQuestion<T extends readonly [object, ...object[]]>(
  questions: T,
  index: number
): T[number] {
  return questions[index] ?? questions[0];
}
