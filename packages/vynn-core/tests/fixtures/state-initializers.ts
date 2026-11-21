export function importedSyncInitializer(): number {
  return 7;
}

export function importedAsyncInitializer(): Promise<number> {
  return Promise.resolve(42);
}
