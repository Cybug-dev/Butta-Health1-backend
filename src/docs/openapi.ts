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
const identity = { id: { type: 'string', format: 'uuid' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } };
const secured = [{ cookieAuth: [] }];
const writeErrors = { '400': failure('Invalid JSON or request validation failed.'), '403': failure('Origin is not allowed.'), '413': failure('Body exceeds 100 KB.'), '415': failure('JSON content type or encoding is unsupported.'), '500': failure('Unexpected server error.') };
const credentials = (register: boolean) => ({ type: 'object', additionalProperties: false,
  required: register ? ['firstName', 'lastName', 'email', 'password'] : ['email', 'password'],
  properties: {
    ...(register ? { firstName: text(100), lastName: text(100) } : {}),
    email: { type: 'string', format: 'email', maxLength: 254, description: 'Trimmed and lowercased.' },
    password: { type: 'string', format: 'password', minLength: register ? 15 : 1, maxLength: 128, writeOnly: true },
  },
});

export const openapi = {
  openapi: '3.0.3',
  info: { title: 'Butta Health API', version: '0.1.0', description: 'Native authentication and personal health profiles. All responses use success/data or success/error envelopes. This documentation is read-only: download the OpenAPI JSON for Postman. Login/register set an HTTP-only cookie; retain it for protected requests. Never paste tokens into Swagger or store them in localStorage. Browser writes require the configured CLIENT_URL origin; existing CSRF restrictions remain in force.' },
  servers: [{ url: '/', description: 'Current API host' }],
  tags: [{ name: 'Health' }, { name: 'Authentication' }, { name: 'Health profile' }],
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
    },
  },
};
