import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkInResponseSchema,
  notificationPreferenceSchema,
  timezoneQuerySchema,
} from '../src/schemas/milestone-two.schemas.js';
import { addCalendarDays, dateKeyAt, startOfZonedDay } from '../src/utils/zoned-date.js';

test('timezone date helpers preserve local calendar boundaries', () => {
  assert.equal(dateKeyAt(new Date('2026-09-14T23:30:00.000Z'), 'Africa/Lagos'), '2026-09-15');
  assert.equal(startOfZonedDay('2026-09-15', 'Africa/Lagos').toISOString(), '2026-09-14T23:00:00.000Z');
  assert.equal(startOfZonedDay('2026-03-08', 'America/New_York').toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(addCalendarDays('2026-03-01', -1), '2026-02-28');
});

test('timezone query accepts IANA zones and rejects unknown fields', () => {
  assert.deepEqual(timezoneQuerySchema.parse({}), { timezone: 'UTC' });
  assert.equal(timezoneQuerySchema.safeParse({ timezone: 'Africa/Lagos' }).success, true);
  assert.equal(timezoneQuerySchema.safeParse({ timezone: 'Not/AZone' }).success, false);
  assert.equal(timezoneQuerySchema.safeParse({ timezone: 'UTC', userId: 'client-owned' }).success, false);
});

test('check-in responses normalize text and reject client-owned fields', () => {
  const parsed = checkInResponseSchema.parse({
    notes: ' Feeling better after resting. ', symptoms: [' Fatigue ', 'Fatigue'],
  });
  assert.equal(parsed.notes, 'Feeling better after resting.');
  assert.deepEqual(parsed.symptoms, ['Fatigue']);
  assert.equal(parsed.severity, 'Not specified');
  assert.equal(checkInResponseSchema.safeParse({ notes: '', healthEventId: 'client-owned' }).success, false);
});

test('notification preferences require a complete and valid schedule', () => {
  const valid = {
    eventReminders: true,
    weeklySummary: false,
    dailyCheckIn: true,
    checkInTime: '08:30',
    timezone: 'Africa/Lagos',
  };
  assert.equal(notificationPreferenceSchema.safeParse(valid).success, true);
  assert.equal(notificationPreferenceSchema.safeParse({ ...valid, checkInTime: '25:00' }).success, false);
  assert.equal(notificationPreferenceSchema.safeParse({ ...valid, userId: 'client-owned' }).success, false);
});
