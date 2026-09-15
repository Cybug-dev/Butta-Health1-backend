import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHealthEventSchema,
  healthEventQuerySchema,
  updateHealthEventSchema,
} from '../src/schemas/health-event.schemas.js';

const validEvent = {
  type: 'SYMPTOM' as const,
  title: ' Morning headache ',
  eventDate: '2026-09-14T08:15:00.000Z',
  severity: 'Moderate' as const,
  symptoms: [' Head pain ', 'Head pain', 'Light sensitivity'],
  treatment: ' Rested and drank water. ',
  notes: 'Headache began shortly after waking.',
  source: 'Typed' as const,
};

test('health event creation normalizes valid patient-entered values', () => {
  const event = createHealthEventSchema.parse(validEvent);
  assert.equal(event.title, 'Morning headache');
  assert.deepEqual(event.symptoms, ['Head pain', 'Light sensitivity']);
  assert.equal(event.treatment, 'Rested and drank water.');
  assert.equal(event.status, 'Confirmed');
});

test('health event creation rejects malformed and client-owned fields', () => {
  for (const event of [
    {},
    { ...validEvent, userId: 'client-controlled' },
    { ...validEvent, type: 'UNKNOWN' },
    { ...validEvent, type: 'CHECK_IN' },
    { ...validEvent, eventDate: 'not-a-date' },
    { ...validEvent, eventDate: '2999-01-01T00:00:00.000Z' },
    { ...validEvent, title: '' },
    { ...validEvent, notes: '' },
    { ...validEvent, symptoms: Array(51).fill('Symptom') },
    { ...validEvent, source: 'Imported' },
  ]) {
    assert.equal(createHealthEventSchema.safeParse(event).success, false);
  }
});

test('health event updates require at least one recognized field', () => {
  assert.equal(updateHealthEventSchema.safeParse({ severity: 'Mild' }).success, true);
  assert.equal(updateHealthEventSchema.safeParse({}).success, false);
  assert.equal(updateHealthEventSchema.safeParse({ userId: 'client-controlled' }).success, false);
});

test('health event list filters normalize pagination and validate ranges', () => {
  const query = healthEventQuerySchema.parse({ type: 'SYMPTOM', limit: '10', search: ' headache ' });
  assert.equal(query.limit, 10);
  assert.equal(query.search, 'headache');
  assert.equal(healthEventQuerySchema.safeParse({ limit: '101' }).success, false);
  assert.equal(healthEventQuerySchema.safeParse({
    from: '2026-09-15T00:00:00.000Z',
    to: '2026-09-14T00:00:00.000Z',
  }).success, false);
});
