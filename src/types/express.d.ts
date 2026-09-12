export {};

declare global {
  namespace Express {
    interface Request {
      auth?: Readonly<{ userId: string }>;
    }
  }
}
