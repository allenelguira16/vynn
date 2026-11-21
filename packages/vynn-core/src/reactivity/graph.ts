/**
 * Dependency tracking shared by reactive primitives.
 * This module intentionally knows nothing about owners, schedulers, or renderers.
 */
export type ReactiveDependency = Set<ReactiveSubscriber>;
export interface ReactiveSubscriber {
  dependencies: ReactiveDependency[];
  disposed: boolean;
  notify(): void;
}
const dependencies = new WeakMap<object, Map<unknown, ReactiveDependency>>();
let activeSubscriber: ReactiveSubscriber | null = null;
function getDependency(target: object, key: unknown): ReactiveDependency {
  let values = dependencies.get(target);
  if (!values) {
    values = new Map();
    dependencies.set(target, values);
  }
  let dependency = values.get(key);
  if (!dependency) {
    dependency = new Set();
    values.set(key, dependency);
  }
  return dependency;
}
export function track(target: object, key: unknown): void {
  const subscriber = activeSubscriber;
  if (!subscriber || subscriber.disposed) return;
  const dependency = getDependency(target, key);
  if (dependency.has(subscriber)) return;
  dependency.add(subscriber);
  subscriber.dependencies.push(dependency);
}
export function trigger(target: object, key: unknown): void {
  const dependency = dependencies.get(target)?.get(key);
  if (!dependency) return;
  for (const subscriber of [...dependency]) {
    if (!subscriber.disposed) subscriber.notify();
  }
}
export function triggerAll(target: object): void {
  const values = dependencies.get(target);
  if (!values) return;
  const subscribers = new Set<ReactiveSubscriber>();
  for (const dependency of values.values()) {
    for (const subscriber of dependency) subscribers.add(subscriber);
  }
  for (const subscriber of subscribers) {
    if (!subscriber.disposed) subscriber.notify();
  }
}
export function triggerArrayLength(
  target: object,
  nextLength: number,
  iterationKey: PropertyKey,
): void {
  const values = dependencies.get(target);
  if (!values) return;
  const subscribers = new Set<ReactiveSubscriber>();
  for (const [key, dependency] of values) {
    const isIndex =
      typeof key === "string" &&
      key !== "" &&
      Number.isInteger(Number(key)) &&
      Number(key) >= 0 &&
      Number(key) < 0xffff_ffff &&
      String(Number(key)) === key;
    if (key === "length" || key === iterationKey || (isIndex && Number(key) >= nextLength)) {
      for (const subscriber of dependency) subscribers.add(subscriber);
    }
  }
  for (const subscriber of subscribers) {
    if (!subscriber.disposed) subscriber.notify();
  }
}
export function cleanupSubscriber(subscriber: ReactiveSubscriber): void {
  for (const dependency of subscriber.dependencies) dependency.delete(subscriber);
  subscriber.dependencies.length = 0;
}
export function withSubscriber<T>(subscriber: ReactiveSubscriber, callback: () => T): T {
  const previous = activeSubscriber;
  activeSubscriber = subscriber;
  try {
    return callback();
  } finally {
    activeSubscriber = previous;
  }
}
export function untrack<T>(callback: () => T): T {
  const previous = activeSubscriber;
  activeSubscriber = null;
  try {
    return callback();
  } finally {
    activeSubscriber = previous;
  }
}
