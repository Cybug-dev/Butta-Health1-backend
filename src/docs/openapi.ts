import { authCookieName } from '../auth/cookie.js';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ 'application/json': { schema } });
const response = (description: string, schema: object) => ({ description, content: json(schema) });
const failure = (description: string) => response(description, ref('Error'));
const envelope = (properties: object) => ({ type: 'object', required: ['success', 'data'], properties: {
  success: { type: 'boolean', enum: [true] }, data: { type: 'object', required: Object.keys(properties), properties },
} });
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const list = { type: 'array', maxItems: 100, items: text(200), description: 'Trimmed nonempty strings; duplicates are removed. Control characters are rejected.' };
const profileProperties = {
  dateOfBirth: { type: 'string', format: 'date', nullable: true, description: 'YYYY-MM-DD, not in the future.', example: '1995-08-17' },
  sex: { ...text(50), nullable: true },
  bloodGroup: { type: 'string', nullable: true, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null] },
  allergies: list, existingConditions: list, currentMedications: list,
  emergencyContactName: { ...text(100), nullable: true },
  emergencyContactPhone: { type: 'string', minLength: 7, maxLength: 30, pattern: '^\\+?[0-9 ()-]+$', nullable: true },
};
const healthEventProperties = {
  type: { type: 'string', enum: ['SYMPTOM', 'MEDICATION', 'DIGESTIVE', 'DOCTOR_VISIT', 'CHECK_IN'] },
  title: text(160),
  eventDate: { type: 'string', format: 'date-time', description: 'When the event occurred. May be at most five minutes in the future.' },
  severity: { type: 'string', enum: ['Mild', 'Moderate', 'Severe', 'Not specified'] },
  symptoms: { type: 'array', maxItems: 50, items: text(200), description: 'Trimmed nonempty strings; duplicates are removed.' },
  treatment: { type: 'string', maxLength: 2000 },
  notes: text(5000),
  source: { type: 'string', enum: ['Typed', 'Voice', 'Preset'] },
  status: { type: 'string', enum: ['Confirmed', 'Needs monitoring', 'Prepared'] },
};
const writableHealthEventType = { type: 'string', enum: ['SYMPTOM', 'MEDICATION', 'DIGESTIVE', 'DOCTOR_VISIT'] };
const identity = { id: { type: 'string', format: 'uuid' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } };
const secured = [{ cookieAuth: [] }];
const writeErrors = { '400': failure('Invalid JSON or request validation failed.'), '403': failure('Origin is not allowed.'), '413': failure('Body exceeds 100 KB.'), '415': failure('JSON content type or encoding is unsupported.'), '500': failure('Unexpected server error.') };
const eventIdParameter = { name: 'id', in: 'path', required: true, description: 'Health event UUID.', schema: { type: 'string', format: 'uuid' } };
const timezoneParameter = { name: 'timezone', in: 'query', required: false, description: 'IANA timezone used for local calendar boundaries. Defaults to UTC.', schema: { type: 'string', default: 'UTC', example: 'Africa/Lagos' } };
const credentials = (register: boolean) => ({ type: 'object', additionalProperties: false,
  required: register ? ['firstName', 'lastName', 'email', 'password'] : ['email', 'password'],
  properties: {
    ...(register ? { firstName: text(100), lastName: text(100) } : {}),
    email: { type: 'string', format: 'email', maxLength: 254, description: 'Trimmed and lowercased.' },
    password: { type: 'string', format: 'password', minLength: register ? 8 : 1, maxLength: 128, writeOnly: true },
  },
});

export const openapi = {
  openapi: '3.0.3',
  info: { title: 'Butta Health API', version: '0.3.0', description: 'Native authentication, private health profiles, user-owned health events, dashboard aggregates, daily check-ins, and notification preferences. All responses use success/data or success/error envelopes. This documentation is read-only: download the OpenAPI JSON for Postman. Login/register set an HTTP-only cookie; retain it for protected requests. Never paste tokens into Swagger or store them in localStorage. Browser writes require the configured CLIENT_URL origin; existing CSRF restrictions remain in force.' },
  servers: [{ url: '/', description: 'Current API host' }],
  tags: [{ name: 'Health' }, { name: 'Authentication' }, { name: 'Health profile' }, { name: 'Health events' }, { name: 'Dashboard' }, { name: 'Check-ins' }, { name: 'Preferences' }, { name: 'AI capture' }, { name: 'Attachments' }],
  paths: {
    '/api/health': { get: { tags: ['Health'], summary: 'Check API availability', responses: { '200': response('API is running; this does not check database connectivity.', envelope({ status: { type: 'string', enum: ['ok'] } })) } } },
    '/api/auth/register': { post: { tags: ['Authentication'], summary: 'Register a local account', description: 'Creates User and LOCAL account atomically. Five attempts per IP per 15 minutes. Returns a session cookie only after creation.', requestBody: { required: true, content: json(ref('RegisterInput')) }, responses: { '201': response('Account created; Set-Cookie establishes authentication.', ref('UserResponse')), ...writeErrors, '409': failure('Registration conflict.'), '429': failure('Too many attempts; observe Retry-After.') } } },
    '/api/auth/login': { post: { tags: ['Authentication'], summary: 'Log in with email and password', description: 'Ten attempts per IP per 15 minutes. Unknown email and incorrect password return the same generic error.', requestBody: { required: true, content: json(ref('LoginInput')) }, responses: { '200': response('Authenticated; Set-Cookie establishes authentication.', ref('UserResponse')), ...writeErrors, '401': failure('Invalid email or password.'), '429': failure('Too many attempts; observe Retry-After.') } } },
    '/api/auth/logout': { post: { tags: ['Authentication'], summary: 'Clear the authentication cookie', description: 'Idempotent; no request body required. Previously copied JWTs remain valid until expiry.', responses: { '200': response('Cookie cleared with matching attributes.', envelope({ message: { type: 'string', example: 'Logged out.' } })), '403': failure('Origin is not allowed.') } } },
    '/api/auth/me': { get: { tags: ['Authentication'], summary: 'Get the authenticated user', security: secured, responses: { '200': response('Safe current-user fields.', ref('UserResponse')), '401': failure('Missing, invalid or expired cookie, or user no longer exists.'), '500': failure('Unexpected server error.') } } },
    '/api/health-profile': {
      get: { tags: ['Health profile'], summary: 'Get your own profile', security: secured, description: 'Ownership comes exclusively from the authentication cookie. Query parameters cannot select another user.', responses: { '200': response('Saved profile.', ref('ProfileResponse')), '401': failure('Authentication required.'), '404': failure('HEALTH_PROFILE_NOT_FOUND: create a profile with PUT first.'), '500': failure('Unexpected server error.') } },
      put: { tags: ['Health profile'], summary: 'Create or replace your own profile', security: secured, description: 'One profile per user. Subsequent PUT requests replace the same row. All three lists are required; omitted optional fields become null. Do not send userId or id.', requestBody: { required: true, content: { 'application/json': { schema: ref('ProfileInput'), example: { dateOfBirth: '1995-08-17', sex: 'Female', bloodGroup: 'O+', allergies: ['Dust'], existingConditions: [], currentMedications: [] } } } }, responses: { '200': response('Profile created or replaced.', ref('ProfileResponse')), '401': failure('Authentication required.'), ...writeErrors } },
    },
    '/api/health-events': {
      get: {
        tags: ['Health events'], summary: 'List your health events', security: secured,
        description: 'Returns only events owned by the authenticated user, newest first. Use nextCursor for the following page.',
        parameters: [
          { name: 'type', in: 'query', schema: healthEventProperties.type },
          { name: 'severity', in: 'query', schema: healthEventProperties.severity },
          { name: 'status', in: 'query', schema: healthEventProperties.status },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'search', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          { name: 'cursor', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        ],
        responses: { '200': response('A page of owned health events.', ref('HealthEventListResponse')), '400': failure('Filters or cursor are invalid.'), '401': failure('Authentication required.'), '500': failure('Unexpected server error.') },
      },
      post: {
        tags: ['Health events'], summary: 'Create a health event', security: secured,
        description: 'Creates an event for the authenticated user. Identity fields are never accepted from the request body.',
        requestBody: { required: true, content: json(ref('HealthEventInput')) },
        responses: { '201': response('Health event created.', ref('HealthEventResponse')), '401': failure('Authentication required.'), ...writeErrors },
      },
    },
    '/api/health-events/{id}': {
      get: {
        tags: ['Health events'], summary: 'Get one of your health events', security: secured, parameters: [eventIdParameter],
        responses: { '200': response('Owned health event.', ref('HealthEventResponse')), '400': failure('Health event ID is invalid.'), '401': failure('Authentication required.'), '404': failure('Health event was not found for this user.'), '500': failure('Unexpected server error.') },
      },
      patch: {
        tags: ['Health events'], summary: 'Update one of your health events', security: secured, parameters: [eventIdParameter],
        requestBody: { required: true, content: json(ref('HealthEventUpdate')) },
        responses: { '200': response('Health event updated.', ref('HealthEventResponse')), '401': failure('Authentication required.'), '404': failure('Health event was not found for this user.'), '409': failure('Linked check-in event type cannot be changed.'), ...writeErrors },
      },
      delete: {
        tags: ['Health events'], summary: 'Delete one of your health events', security: secured, parameters: [eventIdParameter],
        responses: { '200': response('Health event deleted.', envelope({ message: { type: 'string', example: 'Health event deleted.' } })), '400': failure('Health event ID is invalid.'), '401': failure('Authentication required.'), '403': failure('Origin is not allowed.'), '404': failure('Health event was not found for this user.'), '500': failure('Unexpected server error.') },
      },
    },
    '/api/health-events/{id}/attachments': {
      post: {
        tags: ['Health events'], summary: 'Attach uploaded images to a health event', security: secured, parameters: [eventIdParameter],
        description: 'Links previously uploaded, still-pending attachments (see POST /api/attachments) to an owned health event. Attachments must belong to the authenticated user and not already be attached elsewhere.',
        requestBody: { required: true, content: json(ref('AttachHealthEventInput')) },
        responses: { ...writeErrors, '200': response('Attachments linked.', ref('AttachmentListResponse')), '400': failure('One or more attachments were not found or already attached.'), '401': failure('Authentication required.'), '404': failure('Health event was not found for this user.') },
      },
    },
    '/api/attachments': {
      post: {
        tags: ['Attachments'], summary: 'Upload one or more images', security: secured,
        description: 'Accepts multipart/form-data with a "files" field (up to 6 images, 8 MB each; JPEG, PNG, WEBP, or HEIC). Returns pending attachments not yet linked to a health event. 30 uploads per 15 minutes per IP.',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
        responses: {
          '201': response('Uploaded, pending attachments.', ref('AttachmentListResponse')),
          '400': failure('No files were provided.'),
          '401': failure('Authentication required.'),
          '403': failure('Origin is not allowed.'),
          '413': failure('A file exceeds 8 MB, or too many files were sent.'),
          '415': failure('An uploaded file is not an accepted image type.'),
          '429': failure('Too many upload requests; observe Retry-After.'),
          '500': failure('Unexpected server error.'),
        },
      },
    },
    '/api/attachments/{id}/file': {
      get: {
        tags: ['Attachments'], summary: 'Download an owned attachment', security: secured,
        parameters: [{ name: 'id', in: 'path', required: true, description: 'Attachment UUID.', schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'The raw image file.', content: { 'image/jpeg': {}, 'image/png': {}, 'image/webp': {}, 'image/heic': {} } }, '400': failure('Attachment ID is invalid.'), '401': failure('Authentication required.'), '404': failure('Attachment was not found for this user.'), '500': failure('Unexpected server error.') },
      },
    },
    '/api/dashboard': {
      get: {
        tags: ['Dashboard'], summary: 'Get your dashboard snapshot', security: secured,
        description: 'Returns owner-scoped totals, recent events, and seven local-calendar-day activity in one consistent snapshot.',
        parameters: [timezoneParameter],
        responses: { '200': response('Current dashboard aggregates.', ref('DashboardResponse')), '400': failure('Timezone is invalid.'), '401': failure('Authentication required.'), '500': failure('Unexpected server error.') },
      },
    },
    '/api/check-ins/today': {
      get: {
        tags: ['Check-ins'], summary: 'Get or create today\'s check-in', security: secured,
        description: 'Returns one stable deterministic prompt per authenticated user and local calendar day.',
        parameters: [timezoneParameter],
        responses: { '200': response('Today\'s check-in.', ref('CheckInResponse')), '400': failure('Timezone is invalid.'), '401': failure('Authentication required.'), '500': failure('Unexpected server error.') },
      },
    },
    '/api/check-ins/history': {
      get: {
        tags: ['Check-ins'], summary: 'List recent check-ins', security: secured,
        responses: { '200': response('Up to 90 owned check-ins, newest first.', ref('CheckInListResponse')), '401': failure('Authentication required.'), '500': failure('Unexpected server error.') },
      },
    },
    '/api/check-ins/{id}/respond': {
      post: {
        tags: ['Check-ins'], summary: 'Answer a check-in', security: secured,
        description: 'Atomically marks the owned check-in answered and creates one confirmed CHECK_IN health event. Repeated responses are rejected.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: json(ref('CheckInAnswerInput')) },
        responses: { '201': response('Check-in answered and event created.', ref('CheckInAnswerResponse')), '401': failure('Authentication required.'), '404': failure('Check-in was not found for this user.'), '409': failure('Check-in was already answered.'), ...writeErrors },
      },
    },
    '/api/notification-preferences': {
      get: {
        tags: ['Preferences'], summary: 'Get notification preferences', security: secured,
        description: 'Returns the preference defaults created with the account.',
        responses: { '200': response('Owned notification preferences.', ref('NotificationPreferenceResponse')), '401': failure('Authentication required.'), '500': failure('Unexpected server error.') },
      },
      put: {
        tags: ['Preferences'], summary: 'Replace notification preferences', security: secured,
        requestBody: { required: true, content: json(ref('NotificationPreferenceInput')) },
        responses: { '200': response('Preferences saved.', ref('NotificationPreferenceResponse')), '401': failure('Authentication required.'), ...writeErrors },
      },
    },
    '/api/ai-consent': {
      get: {
        tags: ['AI capture'], summary: 'Get your AI-processing consent', security: secured,
        description: 'Consent defaults to not granted. Required before /api/health-events/extract will run.',
        responses: { '200': response('Current consent state.', ref('AiConsentResponse')), '401': failure('Authentication required.'), '500': failure('Unexpected server error.') },
      },
      put: {
        tags: ['AI capture'], summary: 'Grant or revoke AI-processing consent', security: secured,
        requestBody: { required: true, content: json(ref('AiConsentInput')) },
        responses: { '200': response('Consent updated.', ref('AiConsentResponse')), '401': failure('Authentication required.'), ...writeErrors },
      },
    },
    '/api/health-events/extract': {
      post: {
        tags: ['AI capture'], summary: 'Extract a structured draft from a plain-language observation', security: secured,
        description: 'Sends the observation to the configured local model and returns an editable, non-diagnostic draft. Never saves a HealthEvent; only POST /api/health-events persists a confirmed draft. Requires prior AI consent. Curated urgent-symptom phrases are detected independent of model output and force Severe severity plus a safety advisory. 20 requests per 15 minutes per IP.',
        requestBody: { required: true, content: json(ref('AiExtractionInput')) },
        responses: {
          ...writeErrors,
          '200': response('Structured draft and safety metadata.', ref('AiExtractionResponse')),
          '401': failure('Authentication required.'),
          '403': failure('Origin is not allowed, or AI_CONSENT_REQUIRED: grant consent with PUT /api/ai-consent first.'),
          '422': failure('AI_EXTRACTION_REFUSED: the model declined to extract this text.'),
          '429': failure('Too many extraction requests; observe Retry-After.'),
          '502': failure('AI_PROVIDER_MALFORMED_OUTPUT: the provider response did not match the schema.'),
          '503': failure('AI_PROVIDER_UNAVAILABLE: the local model is not reachable.'),
          '504': failure('AI_PROVIDER_TIMEOUT: the provider did not respond in time.'),
        },
      },
    },
  },
  components: {
    securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: authCookieName, description: 'Issued by login/register; HTTP-only, SameSite=Lax, Secure in production. JWTs are not returned in JSON.' } },
    schemas: {
      Error: { type: 'object', required: ['success', 'error'], properties: { success: { type: 'boolean', enum: [false] }, error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      RegisterInput: credentials(true), LoginInput: credentials(false),
      User: { type: 'object', additionalProperties: false, required: ['id', 'email', 'firstName', 'lastName', 'createdAt', 'updatedAt'], properties: { ...identity, email: { type: 'string', format: 'email' }, firstName: text(100), lastName: text(100) } },
      UserResponse: envelope({ user: ref('User') }),
      ProfileInput: { type: 'object', additionalProperties: false, required: ['allergies', 'existingConditions', 'currentMedications'], properties: profileProperties },
      Profile: { type: 'object', additionalProperties: false, required: [...Object.keys(identity), ...Object.keys(profileProperties)], properties: { ...identity, ...profileProperties } },
      ProfileResponse: envelope({ profile: ref('Profile') }),
      HealthEventInput: {
        type: 'object', additionalProperties: false,
        required: ['type', 'title', 'eventDate', 'symptoms', 'notes', 'source'],
        properties: { ...healthEventProperties, type: writableHealthEventType, severity: { ...healthEventProperties.severity, default: 'Not specified' }, treatment: { ...healthEventProperties.treatment, default: '' }, status: { ...healthEventProperties.status, default: 'Confirmed' } },
      },
      HealthEventUpdate: { type: 'object', additionalProperties: false, minProperties: 1, properties: { ...healthEventProperties, type: writableHealthEventType } },
      HealthEvent: { type: 'object', additionalProperties: false, required: [...Object.keys(identity), ...Object.keys(healthEventProperties)], properties: { ...identity, ...healthEventProperties } },
      HealthEventResponse: envelope({ healthEvent: ref('HealthEvent') }),
      HealthEventListResponse: envelope({
        events: { type: 'array', items: ref('HealthEvent') },
        nextCursor: { type: 'string', format: 'uuid', nullable: true },
      }),
      Dashboard: {
        type: 'object', additionalProperties: false,
        required: ['profileCompletion', 'totalEvents', 'eventsThisMonth', 'monitoringCount', 'symptomCount', 'memberSince', 'latestEvent', 'recentEvents', 'activity', 'timezone', 'generatedAt'],
        properties: {
          profileCompletion: { type: 'integer', minimum: 0, maximum: 100 },
          totalEvents: { type: 'integer', minimum: 0 },
          eventsThisMonth: { type: 'integer', minimum: 0 },
          monitoringCount: { type: 'integer', minimum: 0 },
          symptomCount: { type: 'integer', minimum: 0 },
          memberSince: { type: 'string', format: 'date-time' },
          latestEvent: { ...ref('HealthEvent'), nullable: true },
          recentEvents: { type: 'array', maxItems: 4, items: ref('HealthEvent') },
          activity: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', required: ['date', 'label', 'count'], properties: { date: { type: 'string', format: 'date' }, label: { type: 'string' }, count: { type: 'integer', minimum: 0 } } } },
          timezone: { type: 'string' },
          generatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DashboardResponse: envelope({ dashboard: ref('Dashboard') }),
      CheckIn: {
        type: 'object', additionalProperties: false,
        required: ['id', 'promptType', 'promptText', 'scheduledFor', 'respondedAt', 'healthEventId', 'createdAt', 'updatedAt'],
        properties: {
          ...identity,
          promptType: { type: 'string', enum: ['FIRST_ENTRY', 'DAILY_REFLECTION', 'SYMPTOM_FOLLOW_UP', 'MEDICATION_FOLLOW_UP'] },
          promptText: text(500),
          scheduledFor: { type: 'string', format: 'date' },
          respondedAt: { type: 'string', format: 'date-time', nullable: true },
          healthEventId: { type: 'string', format: 'uuid', nullable: true },
        },
      },
      CheckInResponse: envelope({ checkIn: ref('CheckIn') }),
      CheckInListResponse: envelope({ checkIns: { type: 'array', maxItems: 90, items: ref('CheckIn') } }),
      CheckInAnswerInput: {
        type: 'object', additionalProperties: false, required: ['notes'],
        properties: {
          notes: text(2000),
          severity: { ...healthEventProperties.severity, default: 'Not specified' },
          symptoms: { type: 'array', maxItems: 20, items: text(200), default: [] },
        },
      },
      CheckInAnswerResponse: envelope({ checkIn: ref('CheckIn'), healthEvent: ref('HealthEvent') }),
      NotificationPreferenceInput: {
        type: 'object', additionalProperties: false,
        required: ['eventReminders', 'weeklySummary', 'dailyCheckIn', 'checkInTime', 'timezone'],
        properties: {
          eventReminders: { type: 'boolean' },
          weeklySummary: { type: 'boolean' },
          dailyCheckIn: { type: 'boolean' },
          checkInTime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$', example: '09:00' },
          timezone: { type: 'string', maxLength: 100, example: 'Africa/Lagos' },
        },
      },
      NotificationPreferenceResponse: envelope({
        preferences: {
          type: 'object', additionalProperties: false,
          required: ['eventReminders', 'weeklySummary', 'dailyCheckIn', 'checkInTime', 'timezone', 'createdAt', 'updatedAt'],
          properties: {
            eventReminders: { type: 'boolean' }, weeklySummary: { type: 'boolean' }, dailyCheckIn: { type: 'boolean' },
            checkInTime: { type: 'string' }, timezone: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      }),
      AiConsentInput: { type: 'object', additionalProperties: false, required: ['granted'], properties: { granted: { type: 'boolean' } } },
      AiConsentResponse: envelope({
        consent: {
          type: 'object', additionalProperties: false,
          required: ['granted', 'policyVersion', 'grantedAt', 'revokedAt', 'updatedAt'],
          properties: {
            granted: { type: 'boolean' }, policyVersion: { type: 'string' },
            grantedAt: { type: 'string', format: 'date-time', nullable: true },
            revokedAt: { type: 'string', format: 'date-time', nullable: true },
            updatedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      }),
      AiExtractionInput: {
        type: 'object', additionalProperties: false, required: ['observation', 'source'],
        properties: {
          observation: text(2000), source: healthEventProperties.source,
          symptomTags: { type: 'array', maxItems: 12, items: text(60), default: [], description: 'Structured symptom tags selected from quick-add presets. Always merged into the draft\'s symptoms array, independent of model output.' },
        },
      },
      AiExtractionResponse: envelope({
        draft: {
          type: 'object', additionalProperties: false,
          required: ['type', 'title', 'eventDate', 'severity', 'symptoms', 'treatment', 'notes', 'source'],
          properties: { ...healthEventProperties, type: writableHealthEventType },
          description: 'Editable draft only. Confirm with POST /api/health-events to persist it.',
        },
        educationalContext: {
          type: 'array', maxItems: 4, items: text(280),
          description: 'General, non-diagnostic patient-education bullets about the symptom category. Never about this specific patient, never a diagnosis or treatment recommendation, and always empty when safety.urgent is true.',
        },
        safety: {
          type: 'object', additionalProperties: false, required: ['urgent', 'advisory'],
          properties: {
            urgent: { type: 'boolean', description: 'Set by curated server-side rules, independent of model output.' },
            advisory: { type: 'string', nullable: true },
          },
        },
      }),
      AttachHealthEventInput: {
        type: 'object', additionalProperties: false, required: ['attachmentIds'],
        properties: { attachmentIds: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', format: 'uuid' } } },
      },
      Attachment: {
        type: 'object', additionalProperties: false,
        required: ['id', 'status', 'originalName', 'mimeType', 'sizeBytes', 'createdAt', 'url'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['PENDING', 'ATTACHED'] },
          originalName: text(255),
          mimeType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] },
          sizeBytes: { type: 'integer', minimum: 0 },
          createdAt: { type: 'string', format: 'date-time' },
          url: { type: 'string', format: 'uri', description: 'Authenticated download URL; requires the session cookie.' },
        },
      },
      AttachmentListResponse: envelope({ attachments: { type: 'array', maxItems: 6, items: ref('Attachment') } }),
    },
  },
};
