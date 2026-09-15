import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractionOutputSchema, extractionRequestSchema } from '../src/schemas/ai-extraction.schemas.js';
import { detectUrgentSymptoms } from '../src/ai/urgent-symptom-rules.js';
import { sanitizeEducationalContext } from '../src/ai/educational-content-guard.js';

test('extraction request accepts a valid observation and source', () => {
  const parsed = extractionRequestSchema.parse({
    observation: 'I had a headache yesterday evening and felt dizzy this morning.',
    source: 'Typed',
  });
  assert.equal(parsed.source, 'Typed');
  assert.deepEqual(parsed.symptomTags, []);
});

test('extraction request normalizes and deduplicates symptom tags', () => {
  const parsed = extractionRequestSchema.parse({
    observation: 'Valid text',
    source: 'Typed',
    symptomTags: ['Headaches / head pain', 'Headaches / head pain', 'Dizziness / lightheaded'],
  });
  assert.deepEqual(parsed.symptomTags, ['Headaches / head pain', 'Dizziness / lightheaded']);
});

test('extraction request rejects too many or invalid symptom tags', () => {
  for (const input of [
    { observation: 'Valid text', source: 'Typed', symptomTags: Array(13).fill('Tag') },
    { observation: 'Valid text', source: 'Typed', symptomTags: [''] },
    { observation: 'Valid text', source: 'Typed', symptomTags: 'not-an-array' },
  ]) {
    assert.equal(extractionRequestSchema.safeParse(input).success, false);
  }
});

test('extraction request rejects empty text, unknown fields, and CHECK_IN-only sources', () => {
  for (const input of [
    {},
    { observation: '', source: 'Typed' },
    { observation: 'x'.repeat(2001), source: 'Typed' },
    { observation: 'Valid text', source: 'Imported' },
    { observation: 'Valid text', source: 'Typed', userId: 'client-controlled' },
  ]) {
    assert.equal(extractionRequestSchema.safeParse(input).success, false);
  }
});

const validOutput = {
  type: 'SYMPTOM' as const,
  title: 'Headache observation',
  severity: 'Mild' as const,
  symptoms: ['Head pain', 'Head pain', 'Delayed onset'],
  treatment: '',
};

test('extraction output schema normalizes and deduplicates model output', () => {
  const parsed = extractionOutputSchema.parse(validOutput);
  assert.deepEqual(parsed.symptoms, ['Head pain', 'Delayed onset']);
});

test('extraction output schema defaults educationalContext to an empty array and caps at 4 bullets', () => {
  assert.deepEqual(extractionOutputSchema.parse(validOutput).educationalContext, []);
  assert.equal(
    extractionOutputSchema.safeParse({ ...validOutput, educationalContext: Array(5).fill('Bullet') }).success,
    false,
  );
});

test('extraction output schema rejects a CHECK_IN type and unknown fields from the model', () => {
  for (const output of [
    { ...validOutput, type: 'CHECK_IN' },
    { ...validOutput, type: 'UNKNOWN' },
    { ...validOutput, title: '' },
    { ...validOutput, symptoms: Array(21).fill('Symptom') },
    { ...validOutput, diagnosis: 'Migraine' },
  ]) {
    assert.equal(extractionOutputSchema.safeParse(output).success, false);
  }
});

test('urgent symptom rules flag curated phrases independent of the model', () => {
  assert.equal(detectUrgentSymptoms('I have chest pain and shortness of breath.'), true);
  assert.equal(detectUrgentSymptoms('I felt a bit dizzy after standing up quickly.'), false);
  assert.equal(detectUrgentSymptoms('Worst headache of my life, started an hour ago.'), true);
});

test('educational content guard strips diagnostic and prescriptive phrasing', () => {
  assert.deepEqual(sanitizeEducationalContext([
    'You have a migraine and should take 400mg ibuprofen.',
    'Headaches are commonly associated with dehydration and stress.',
    'I recommend resting in a dark room.',
    'This is likely a tension headache.',
    'Your condition often improves with sleep.',
    'Frequently linked to poor posture and screen time.',
  ]), [
    'Headaches are commonly associated with dehydration and stress.',
    'Frequently linked to poor posture and screen time.',
  ]);
});

test('educational content guard returns an empty array when nothing survives filtering', () => {
  assert.deepEqual(sanitizeEducationalContext(['You should try ibuprofen.']), []);
});

test('educational content guard passes through an already-empty list', () => {
  assert.deepEqual(sanitizeEducationalContext([]), []);
});
