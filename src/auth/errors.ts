import { ApiError } from '../errors/api-error.js';

export class AuthError extends ApiError {}

export function unauthorized() {
  return new AuthError(401, 'UNAUTHORIZED', 'Authentication required.');
}
