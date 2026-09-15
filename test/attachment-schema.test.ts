import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { attachHealthEventSchema } from '../src/schemas/attachment.schemas.js';

test('attach schema accepts one to six attachment IDs', () => {
  const parsed = attachHealthEventSchema.parse({ attachmentIds: [randomUUID()] });
  assert.equal(parsed.attachmentIds.length, 1);
});

test('attach schema rejects empty, oversized, or invalid attachment ID lists', () => {
  for (const input of [
    { attachmentIds: [] },
    { attachmentIds: Array.from({ length: 7 }, () => randomUUID()) },
    { attachmentIds: ['not-a-uuid'] },
    { attachmentIds: [randomUUID()], healthEventId: randomUUID() },
    {},
  ]) {
    assert.equal(attachHealthEventSchema.safeParse(input).success, false);
  }
});
