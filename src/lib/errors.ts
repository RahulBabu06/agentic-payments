/** A deliberately public message. Never wrap a raw provider error in this class. */
export class ServiceError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ServiceError";
  }
}
