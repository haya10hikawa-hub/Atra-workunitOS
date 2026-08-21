export declare class StateStoreError extends Error {
  readonly code: string;
  constructor(code: string);
}

export declare class ControllerStateStore {
  readonly filePath: string;
  constructor(filePath: string);
  load(): object | null;
  save(state: object): void;
}
