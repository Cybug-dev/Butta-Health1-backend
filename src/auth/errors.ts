export class AuthError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function unauthorized() {
  return new AuthError(401, 'UNAUTHORIZED', 'Authentication required.');
}
