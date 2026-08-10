export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

export class PersistenceValidationError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceValidationError";
  }
}

export class PersistenceConflictError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceConflictError";
  }
}

export class PersistenceCorruptionError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceCorruptionError";
  }
}

export class PersistenceNotFoundError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceNotFoundError";
  }
}
