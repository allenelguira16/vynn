import { AriaAttributes, CoreAttributes, EventAttributes } from "./common-attribute";
import { JSX } from "./jsx";

export type HTMLAttributes<T extends Element = Element> = CoreAttributes &
  EventAttributes<T> &
  AriaAttributes & {
    children?: JSX.Element;
    ref?: ((element: T) => void) | T;
    html?: string;
  };

export type HTMLVoidAttributes<T extends Element = Element> = Omit<HTMLAttributes<T>, "children">;

export type HTMLAnchorAttributes<T extends Element = HTMLAnchorElement> = HTMLAttributes<T> & {
  download?: any;
  href?: string;
  hrefLang?: string;
  media?: string;
  ping?: string;
  rel?: string;
  target?: string;
  type?: string;
  referrerPolicy?: string;
};

export type HTMLImgAttributes<T extends Element = HTMLImageElement> = HTMLVoidAttributes<T> & {
  alt?: string;
  crossOrigin?: "anonymous" | "use-credentials" | "";
  decoding?: "async" | "auto" | "sync";
  height?: number | string;
  loading?: "eager" | "lazy";
  referrerPolicy?: string;
  sizes?: string;
  src?: string;
  srcSet?: string;
  useMap?: string;
  width?: number | string;
};

export type HTMLLabelAttributes<T extends Element = HTMLLabelElement> = HTMLAttributes<T> & {
  form?: string;
  for?: string;
};

export type HTMLAudioAttributes<T extends Element = HTMLAudioElement> = HTMLMediaAttributes<T>;

export type HTMLVideoAttributes<T extends Element = HTMLVideoElement> = HTMLMediaAttributes<T> & {
  height?: number | string;
  playsInline?: boolean;
  poster?: string;
  width?: number | string;
};

export type HTMLMediaAttributes<T extends Element = HTMLMediaElement> = HTMLAttributes<T> & {
  autoPlay?: boolean;
  controls?: boolean;
  controlsList?: string;
  crossOrigin?: "anonymous" | "use-credentials" | "";
  loop?: boolean;
  mediaGroup?: string;
  muted?: boolean;
  preload?: "none" | "metadata" | "auto" | "";
  src?: string;
};

export type HTMLIframeAttributes<T extends Element = HTMLIFrameElement> = HTMLAttributes<T> & {
  allow?: string;
  allowFullScreen?: boolean;
  height?: number | string;
  loading?: "eager" | "lazy";
  name?: string;
  referrerPolicy?: string;
  sandbox?: string;
  src?: string;
  srcDoc?: string;
  width?: number | string;
};

export type HTMLEmbedAttributes<T extends Element = HTMLEmbedElement> = HTMLVoidAttributes<T> & {
  height?: number | string;
  src?: string;
  type?: string;
  width?: number | string;
};

export type HTMLObjectAttributes<T extends Element = HTMLObjectElement> = HTMLAttributes<T> & {
  classID?: string;
  data?: string;
  form?: string;
  height?: number | string;
  name?: string;
  type?: string;
  useMap?: string;
  width?: number | string;
};

export type HTMLLinkAttributes<T extends Element = HTMLLinkElement> = HTMLVoidAttributes<T> & {
  as?: string;
  crossOrigin?: string;
  href?: string;
  hrefLang?: string;
  integrity?: string;
  media?: string;
  referrerPolicy?: string;
  rel?: string;
  sizes?: string;
  type?: string;
  charSet?: string;
};

export type HTMLMetaAttributes<T extends Element = HTMLMetaElement> = HTMLVoidAttributes<T> & {
  charSet?: string;
  content?: string;
  httpEquiv?: string;
  name?: string;
};

export type HTMLScriptAttributes<T extends Element = HTMLScriptElement> = HTMLAttributes<T> & {
  async?: boolean;
  charSet?: string;
  crossOrigin?: string;
  defer?: boolean;
  integrity?: string;
  noModule?: boolean;
  nonce?: string;
  referrerPolicy?: string;
  src?: string;
  type?: string;
};

export type HTMLInputAttributes<T extends Element = HTMLInputElement> = HTMLVoidAttributes<T> & {
  accept?: string;
  alt?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  capture?: boolean | "user" | "environment";
  checked?: boolean;
  crossOrigin?: "anonymous" | "use-credentials" | "";
  disabled?: boolean;
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  form?: string;
  formAction?: string;
  formEncType?: string;
  formMethod?: string;
  formNoValidate?: boolean;
  formTarget?: string;
  height?: number | string;
  list?: string;
  max?: number | string;
  maxLength?: number;
  min?: number | string;
  minLength?: number;
  multiple?: boolean;
  name?: string;
  pattern?: string;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  size?: number;
  src?: string;
  step?: number | string;
  type?: string;
  value?: string | readonly string[] | number;
  width?: number | string;
};

export type HTMLTextAreaAttributes<T extends Element = HTMLTextAreaElement> = HTMLAttributes<T> & {
  autoComplete?: string;
  autoFocus?: boolean;
  cols?: number;
  dirName?: string;
  disabled?: boolean;
  form?: string;
  maxLength?: number;
  minLength?: number;
  name?: string;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  rows?: number;
  wrap?: "hard" | "soft" | "off";
  value?: string | number | readonly string[];
};

export type HTMLButtonAttributes<T extends Element = HTMLButtonElement> = HTMLAttributes<T> & {
  autoFocus?: boolean;
  disabled?: boolean;
  form?: string;
  formAction?: string;
  formEncType?: string;
  formMethod?: string;
  formNoValidate?: boolean;
  formTarget?: string;
  name?: string;
  type?: "submit" | "reset" | "button";
  value?: string | readonly string[] | number;
};

export type HTMLSelectAttributes<T extends Element = HTMLSelectElement> = HTMLAttributes<T> & {
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  form?: string;
  multiple?: boolean;
  name?: string;
  required?: boolean;
  size?: number;
  value?: string | readonly string[] | number;
};

export type HTMLOptionAttributes<T extends Element = HTMLOptionElement> = HTMLAttributes<T> & {
  disabled?: boolean;
  label?: string;
  selected?: boolean;
  value?: string | number | string[];
};

export type HTMLFormAttributes<T extends Element = HTMLFormElement> = HTMLAttributes<T> & {
  acceptCharset?: string;
  action?: string;
  autoComplete?: string;
  encType?: string;
  method?: string;
  name?: string;
  noValidate?: boolean;
  target?: string;
};

export type HTMLFieldsetAttributes<T extends Element = HTMLFieldSetElement> = HTMLAttributes<T> & {
  disabled?: boolean;
  form?: string;
  name?: string;
};

export type HTMLLegendAttributes<T extends Element = HTMLLegendElement> = HTMLAttributes<T> & {};

export type HTMLOptgroupAttributes<T extends Element = HTMLOptGroupElement> = HTMLAttributes<T> & {
  disabled?: boolean;
  label?: string;
};

export type HTMLOutputAttributes<T extends Element = HTMLOutputElement> = HTMLAttributes<T> & {
  for?: string;
  form?: string;
  name?: string;
};

export type HTMLParamAttributes<T extends Element = HTMLParamElement> = HTMLVoidAttributes<T> & {
  name?: string;
  value?: string;
};

export type HTMLProgressAttributes<T extends Element = HTMLProgressElement> = HTMLAttributes<T> & {
  max?: number;
  value?: number;
};

export type HTMLMeterAttributes<T extends Element = HTMLMeterElement> = HTMLAttributes<T> & {
  form?: string;
  high?: number;
  low?: number;
  max?: number;
  min?: number;
  optimum?: number;
  value?: string | number;
};

export type HTMLDetailsAttributes<T extends Element = HTMLDetailsElement> = HTMLAttributes<T> & {
  open?: boolean;
};

export type HTMLSummaryAttributes<T extends Element = HTMLElement> = HTMLAttributes<T>;

export type HTMLTableAttributes<T extends Element = HTMLTableElement> = HTMLAttributes<T> & {
  cellPadding?: number | string;
  cellSpacing?: number | string;
  summary?: string;
};

export type HTMLTdAttributes<T extends Element = HTMLTableDataCellElement> = HTMLAttributes<T> & {
  colSpan?: number;
  headers?: string;
  rowSpan?: number;
  scope?: string;
  abbr?: string;
  align?: string;
};

export type HTMLThAttributes<T extends Element = HTMLTableHeaderCellElement> = HTMLAttributes<T> & {
  colSpan?: number;
  headers?: string;
  rowSpan?: number;
  scope?: string;
  abbr?: string;
  align?: string;
};

export type HTMLTimeAttributes<T extends Element = HTMLTimeElement> = HTMLAttributes<T> & {
  dateTime?: string;
};

export type HTMLTrackAttributes<T extends Element = HTMLTrackElement> = HTMLVoidAttributes<T> & {
  default?: boolean;
  kind?: string;
  label?: string;
  src?: string;
  srcLang?: string;
};

export type HTMLSourceAttributes<T extends Element = HTMLSourceElement> = HTMLVoidAttributes<T> & {
  media?: string;
  sizes?: string;
  src?: string;
  srcSet?: string;
  type?: string;
};

export type HTMLDataAttributes<T extends Element = HTMLDataElement> = HTMLAttributes<T> & {
  value?: string | number;
};

export type HTMLDelAttributes<T extends Element = HTMLModElement> = HTMLAttributes<T> & {
  cite?: string;
  dateTime?: string;
};

export type HTMLInsAttributes<T extends Element = HTMLModElement> = HTMLAttributes<T> & {
  cite?: string;
  dateTime?: string;
};
