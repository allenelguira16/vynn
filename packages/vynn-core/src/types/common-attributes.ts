import {
  AnimationEventHandler,
  EventHandler,
  FocusEventHandler,
  InputEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  SubmitEventHandler,
  TransitionEventHandler,
  UIEventHandler,
  WheelEventHandler,
} from "./event-handler";

export type CoreAttributes = {
  id?: string;
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  title?: string;
  tabindex?: number;
  hidden?: boolean;
  draggable?: boolean;
  contentEditable?: boolean;
  accesskey?: string;
  lang?: string;
  spellcheck?: boolean;
  translate?: "yes" | "no";
  dir?: "ltr" | "rtl" | "auto";
  role?: string;
  slot?: string;
  part?: string;
  is?: string;
  autoCapitalize?: string;
  inputMode?: string;
  enterKeyHint?: string;
  radiogroup?: string;
  results?: number;
  security?: string;
  unselectable?: "on" | "off";
};

export type EventAttributes<T extends Element = Element> = {
  // Mouse events
  onClick?: MouseEventHandler<T>;
  onDoubleClick?: MouseEventHandler<T>;
  onMouseDown?: MouseEventHandler<T>;
  onMouseUp?: MouseEventHandler<T>;
  onMouseEnter?: MouseEventHandler<T>;
  onMouseLeave?: MouseEventHandler<T>;
  onMouseOver?: MouseEventHandler<T>;
  onMouseOut?: MouseEventHandler<T>;

  // Keyboard events
  onKeyDown?: KeyboardEventHandler<T>;
  onKeyUp?: KeyboardEventHandler<T>;
  onKeyPress?: KeyboardEventHandler<T>;

  // Form events
  onInput?: InputEventHandler<T>;
  onChange?: EventHandler<Event, T>;
  onFocus?: FocusEventHandler<T>;
  onBlur?: FocusEventHandler<T>;
  onSubmit?: SubmitEventHandler<T>;
  onReset?: EventHandler<Event, T>;

  // Other UI events
  onContextMenu?: MouseEventHandler<T>;
  onWheel?: WheelEventHandler<T>;
  onScroll?: UIEventHandler<T>;
  onResize?: UIEventHandler<T>;

  // Animation & Transition
  onAnimationStart?: AnimationEventHandler<T>;
  onAnimationEnd?: AnimationEventHandler<T>;
  onAnimationIteration?: AnimationEventHandler<T>;
  onTransitionEnd?: TransitionEventHandler<T>;

  // Load/Error events
  onLoad?: EventHandler<Event, T>;
  onUnload?: EventHandler<Event, T>;
  onError?: EventHandler<Event, T>;
};

export type AriaAttributes = {
  "aria-activedescendant"?: string;
  "aria-atomic"?: boolean;
  "aria-autocomplete"?: "inline" | "list" | "both" | "none";
  "aria-busy"?: boolean;
  "aria-checked"?: boolean | "mixed";
  "aria-colcount"?: number;
  "aria-colindex"?: number;
  "aria-colspan"?: number;
  "aria-controls"?: string;
  "aria-current"?: boolean | "page" | "step" | "location" | "date" | "time";
  "aria-describedby"?: string;
  "aria-details"?: string;
  "aria-disabled"?: boolean;
  "aria-dropeffect"?: "copy" | "execute" | "link" | "move" | "none" | "popup";
  "aria-errormessage"?: string;
  "aria-expanded"?: boolean;
  "aria-flowto"?: string;
  "aria-grabbed"?: boolean;
  "aria-haspopup"?: boolean | "dialog" | "menu" | "listbox" | "tree" | "grid";
  "aria-hidden"?: boolean;
  "aria-invalid"?: boolean | "grammar" | "spelling";
  "aria-keyshortcuts"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-level"?: number;
  "aria-live"?: "off" | "polite" | "assertive";
  "aria-modal"?: boolean;
  "aria-multiline"?: boolean;
  "aria-multiselectable"?: boolean;
  "aria-orientation"?: "horizontal" | "vertical";
  "aria-owns"?: string;
  "aria-placeholder"?: string;
  "aria-posinset"?: number;
  "aria-pressed"?: boolean | "mixed";
  "aria-readonly"?: boolean;
  "aria-relevant"?: string;
  "aria-required"?: boolean;
  "aria-roledescription"?: string;
  "aria-rowcount"?: number;
  "aria-rowindex"?: number;
  "aria-rowspan"?: number;
  "aria-selected"?: boolean;
  "aria-setsize"?: number;
  "aria-sort"?: "none" | "ascending" | "descending" | "other";
  "aria-valuemax"?: number;
  "aria-valuemin"?: number;
  "aria-valuenow"?: number;
  "aria-valuetext"?: string;
};
