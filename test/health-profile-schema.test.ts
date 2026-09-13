import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthProfileSchema } from '../src/schemas/health-profile.schemas.js';

const validProfile = {
  dateOfBirth: '2000-01-01',
  sex: ' Female ',
  bloodGroup: 'O+' as const,
  allergies: [' Dust ', 'Dust'],
  existingConditions: [],
  currentMedications: ['Medication A'],
  emergencyContactName: ' Grace Tester ',
  emergencyContactPhone: ' +234 801 234 5678 ',
};

test('health profile validation normalizes valid user-entered values', () => {
  const profile = healthProfileSchema.parse(validProfile);
  assert.equal(profile.sex, 'Female');
  assert.deepEqual(profile.allergies, ['Dust']);
  assert.equal(profile.emergencyContactName, 'Grace Tester');
  assert.equal(profile.emergencyContactPhone, '+234 801 234 5678');
});

test('health profile validation rejects unsafe or malformed values', () => {
  for (const profile of [
    {},
    { ...validProfile, userId: 'client-controlled' },
    { ...validProfile, dateOfBirth: '2999-01-01' },
    { ...validProfile, dateOfBirth: '01/01/2000' },
    { ...validProfile, bloodGroup: 'unknown' },
    { ...validProfile, allergies: [''] },
    { ...validProfile, currentMedications: Array(101).fill('Medication') },
    { ...validProfile, emergencyContactPhone: 'not-a-phone' },
  ]) {
    assert.equal(healthProfileSchema.safeParse(profile).success, false);
  }
});
