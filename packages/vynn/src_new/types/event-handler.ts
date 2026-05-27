export type EventHandler<E extends Event, T extends Element = Element> = (
  event: E & { currentTarget: T },
) => void;

export type MouseEventHandler<T extends Element = Element> = EventHandler<MouseEvent, T>;
export type KeyboardEventHandler<T extends Element = Element> = EventHandler<KeyboardEvent, T>;
export type FocusEventHandler<T extends Element = Element> = EventHandler<FocusEvent, T>;
export type InputEventHandler<T extends Element = Element> = EventHandler<InputEvent, T>;
export type SubmitEventHandler<T extends Element = Element> = EventHandler<SubmitEvent, T>;
export type UIEventHandler<T extends Element = Element> = EventHandler<UIEvent, T>;
export type WheelEventHandler<T extends Element = Element> = EventHandler<WheelEvent, T>;
export type AnimationEventHandler<T extends Element = Element> = EventHandler<AnimationEvent, T>;
export type TransitionEventHandler<T extends Element = Element> = EventHandler<TransitionEvent, T>;
