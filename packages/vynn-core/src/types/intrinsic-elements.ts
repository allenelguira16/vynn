import {
  HTMLAnchorAttributes,
  HTMLAttributes,
  HTMLAudioAttributes,
  HTMLButtonAttributes,
  HTMLDataAttributes,
  HTMLDelAttributes,
  HTMLDetailsAttributes,
  HTMLEmbedAttributes,
  HTMLFieldsetAttributes,
  HTMLFormAttributes,
  HTMLIframeAttributes,
  HTMLImgAttributes,
  HTMLInputAttributes,
  HTMLInsAttributes,
  HTMLLabelAttributes,
  HTMLLegendAttributes,
  HTMLLinkAttributes,
  HTMLMetaAttributes,
  HTMLMeterAttributes,
  HTMLObjectAttributes,
  HTMLOptgroupAttributes,
  HTMLOptionAttributes,
  HTMLOutputAttributes,
  HTMLParamAttributes,
  HTMLProgressAttributes,
  HTMLScriptAttributes,
  HTMLSelectAttributes,
  HTMLSourceAttributes,
  HTMLSummaryAttributes,
  HTMLTableAttributes,
  HTMLTdAttributes,
  HTMLTextAreaAttributes,
  HTMLThAttributes,
  HTMLTimeAttributes,
  HTMLTrackAttributes,
  HTMLVideoAttributes,
  HTMLVoidAttributes,
} from "./dom-attributes";
import { SVGAttributes } from "./svg-attributes";

export interface JSXIntrinsicElements {
  a: HTMLAnchorAttributes<HTMLAnchorElement>;
  abbr: HTMLAttributes<HTMLElement>;
  address: HTMLAttributes<HTMLElement>;
  area: HTMLVoidAttributes<HTMLAreaElement>;
  article: HTMLAttributes<HTMLElement>;
  aside: HTMLAttributes<HTMLElement>;
  audio: HTMLAudioAttributes<HTMLAudioElement>;
  b: HTMLAttributes<HTMLElement>;
  base: HTMLVoidAttributes<HTMLBaseElement>;
  bdi: HTMLAttributes<HTMLElement>;
  bdo: HTMLAttributes<HTMLElement>;
  big: HTMLAttributes<HTMLElement>;
  blockquote: HTMLAttributes<HTMLQuoteElement>;
  body: HTMLAttributes<HTMLBodyElement>;
  br: HTMLVoidAttributes<HTMLBRElement>;
  button: HTMLButtonAttributes<HTMLButtonElement>;
  canvas: HTMLAttributes<HTMLCanvasElement>;
  caption: HTMLAttributes<HTMLElement>;
  code: HTMLAttributes<HTMLElement>;
  col: HTMLVoidAttributes<HTMLTableColElement>;
  colgroup: HTMLAttributes<HTMLTableColElement>;
  data: HTMLDataAttributes<HTMLDataElement>;
  datalist: HTMLAttributes<HTMLDataListElement>;
  dd: HTMLAttributes<HTMLElement>;
  del: HTMLDelAttributes<HTMLModElement>;
  details: HTMLDetailsAttributes<HTMLDetailsElement>;
  dfn: HTMLAttributes<HTMLElement>;
  dialog: HTMLAttributes<HTMLDialogElement>;
  div: HTMLAttributes<HTMLDivElement>;
  dl: HTMLAttributes<HTMLDListElement>;
  dt: HTMLAttributes<HTMLElement>;
  em: HTMLAttributes<HTMLElement>;
  embed: HTMLEmbedAttributes<HTMLEmbedElement>;
  fieldset: HTMLFieldsetAttributes<HTMLFieldSetElement>;
  figcaption: HTMLAttributes<HTMLElement>;
  figure: HTMLAttributes<HTMLElement>;
  footer: HTMLAttributes<HTMLElement>;
  form: HTMLFormAttributes<HTMLFormElement>;
  h1: HTMLAttributes<HTMLHeadingElement>;
  h2: HTMLAttributes<HTMLHeadingElement>;
  h3: HTMLAttributes<HTMLHeadingElement>;
  h4: HTMLAttributes<HTMLHeadingElement>;
  h5: HTMLAttributes<HTMLHeadingElement>;
  h6: HTMLAttributes<HTMLHeadingElement>;
  head: HTMLAttributes<HTMLHeadElement>;
  header: HTMLAttributes<HTMLElement>;
  hgroup: HTMLAttributes<HTMLElement>;
  hr: HTMLVoidAttributes<HTMLHRElement>;
  html: HTMLAttributes<HTMLHtmlElement>;
  i: HTMLAttributes<HTMLElement>;
  iframe: HTMLIframeAttributes<HTMLIFrameElement>;
  img: HTMLImgAttributes<HTMLImageElement>;
  input: HTMLInputAttributes<HTMLInputElement>;
  ins: HTMLInsAttributes<HTMLModElement>;
  kbd: HTMLAttributes<HTMLElement>;
  // keygen: HTMLAttributes<HTMLElement>;
  label: HTMLLabelAttributes<HTMLLabelElement>;
  legend: HTMLLegendAttributes<HTMLLegendElement>;
  li: HTMLAttributes<HTMLLIElement>;
  link: HTMLLinkAttributes<HTMLLinkElement>;
  main: HTMLAttributes<HTMLElement>;
  map: HTMLAttributes<HTMLMapElement>;
  mark: HTMLAttributes<HTMLElement>;
  menu: HTMLAttributes<HTMLElement>;
  // menuitem: HTMLAttributes<HTMLElement>;
  meta: HTMLMetaAttributes<HTMLMetaElement>;
  meter: HTMLMeterAttributes<HTMLMeterElement>;
  noindex: HTMLAttributes<HTMLElement>;
  noscript: HTMLAttributes<HTMLElement>;
  object: HTMLObjectAttributes<HTMLObjectElement>;
  ol: HTMLAttributes<HTMLOListElement>;
  optgroup: HTMLOptgroupAttributes<HTMLOptGroupElement>;
  option: HTMLOptionAttributes<HTMLOptionElement>;
  output: HTMLOutputAttributes<HTMLOutputElement>;
  p: HTMLAttributes<HTMLParagraphElement>;
  param: HTMLParamAttributes<HTMLParamElement>;
  picture: HTMLAttributes<HTMLElement>;
  pre: HTMLAttributes<HTMLPreElement>;
  progress: HTMLProgressAttributes<HTMLProgressElement>;
  q: HTMLAttributes<HTMLQuoteElement>;
  rp: HTMLAttributes<HTMLElement>;
  rt: HTMLAttributes<HTMLElement>;
  ruby: HTMLAttributes<HTMLElement>;
  s: HTMLAttributes<HTMLElement>;
  samp: HTMLAttributes<HTMLElement>;
  search: HTMLAttributes<HTMLElement>;
  slot: HTMLAttributes<HTMLSlotElement>;
  script: HTMLScriptAttributes<HTMLScriptElement>;
  section: HTMLAttributes<HTMLElement>;
  select: HTMLSelectAttributes<HTMLSelectElement>;
  small: HTMLAttributes<HTMLElement>;
  source: HTMLSourceAttributes<HTMLSourceElement>;
  span: HTMLAttributes<HTMLSpanElement>;
  strong: HTMLAttributes<HTMLElement>;
  style: HTMLAttributes<HTMLStyleElement>;
  sub: HTMLAttributes<HTMLElement>;
  summary: HTMLSummaryAttributes<HTMLElement>;
  sup: HTMLAttributes<HTMLElement>;
  table: HTMLTableAttributes<HTMLTableElement>;
  template: HTMLAttributes<HTMLTemplateElement>;
  tbody: HTMLAttributes<HTMLTableSectionElement>;
  td: HTMLTdAttributes<HTMLTableDataCellElement>;
  textarea: HTMLTextAreaAttributes<HTMLTextAreaElement>;
  tfoot: HTMLAttributes<HTMLTableSectionElement>;
  th: HTMLThAttributes<HTMLTableHeaderCellElement>;
  thead: HTMLAttributes<HTMLTableSectionElement>;
  time: HTMLTimeAttributes<HTMLTimeElement>;
  tr: HTMLAttributes<HTMLTableRowElement>;
  track: HTMLTrackAttributes<HTMLTrackElement>;
  u: HTMLAttributes<HTMLElement>;
  ul: HTMLAttributes<HTMLUListElement>;
  var: HTMLAttributes<HTMLElement>;
  video: HTMLVideoAttributes<HTMLVideoElement>;
  wbr: HTMLVoidAttributes<HTMLElement>;

  // SVG Elements
  svg: SVGAttributes<SVGSVGElement>;
  animate: SVGAttributes<SVGAnimateElement>;
  animateMotion: SVGAttributes<SVGAnimateMotionElement>;
  animateTransform: SVGAttributes<SVGAnimateTransformElement>;
  circle: SVGAttributes<SVGCircleElement>;
  clipPath: SVGAttributes<SVGClipPathElement>;
  defs: SVGAttributes<SVGDefsElement>;
  desc: SVGAttributes<SVGDescElement>;
  ellipse: SVGAttributes<SVGEllipseElement>;
  feBlend: SVGAttributes<SVGFEBlendElement>;
  feColorMatrix: SVGAttributes<SVGFEColorMatrixElement>;
  feComponentTransfer: SVGAttributes<SVGFEComponentTransferElement>;
  feComposite: SVGAttributes<SVGFECompositeElement>;
  feConvolveMatrix: SVGAttributes<SVGFEConvolveMatrixElement>;
  feDiffuseLighting: SVGAttributes<SVGFEDiffuseLightingElement>;
  feDisplacementMap: SVGAttributes<SVGFEDisplacementMapElement>;
  feDistantLight: SVGAttributes<SVGFEDistantLightElement>;
  feDropShadow: SVGAttributes<SVGFEDropShadowElement>;
  feFlood: SVGAttributes<SVGFEFloodElement>;
  feFuncA: SVGAttributes<SVGFEFuncAElement>;
  feFuncB: SVGAttributes<SVGFEFuncBElement>;
  feFuncG: SVGAttributes<SVGFEFuncGElement>;
  feFuncR: SVGAttributes<SVGFEFuncRElement>;
  feGaussianBlur: SVGAttributes<SVGFEGaussianBlurElement>;
  feImage: SVGAttributes<SVGFEImageElement>;
  feMerge: SVGAttributes<SVGFEMergeElement>;
  feMergeNode: SVGAttributes<SVGFEMergeNodeElement>;
  feMorphology: SVGAttributes<SVGFEMorphologyElement>;
  feOffset: SVGAttributes<SVGFEOffsetElement>;
  fePointLight: SVGAttributes<SVGFEPointLightElement>;
  feSpecularLighting: SVGAttributes<SVGFESpecularLightingElement>;
  feSpotLight: SVGAttributes<SVGFESpotLightElement>;
  feTile: SVGAttributes<SVGFETileElement>;
  feTurbulence: SVGAttributes<SVGFETurbulenceElement>;
  filter: SVGAttributes<SVGFilterElement>;
  foreignObject: SVGAttributes<SVGForeignObjectElement>;
  g: SVGAttributes<SVGGElement>;
  image: SVGAttributes<SVGImageElement>;
  line: SVGAttributes<SVGLineElement>;
  linearGradient: SVGAttributes<SVGLinearGradientElement>;
  marker: SVGAttributes<SVGMarkerElement>;
  mask: SVGAttributes<SVGMaskElement>;
  metadata: SVGAttributes<SVGMetadataElement>;
  mpath: SVGAttributes<SVGElement>;
  path: SVGAttributes<SVGPathElement>;
  pattern: SVGAttributes<SVGPatternElement>;
  polygon: SVGAttributes<SVGPolygonElement>;
  polyline: SVGAttributes<SVGPolylineElement>;
  radialGradient: SVGAttributes<SVGRadialGradientElement>;
  rect: SVGAttributes<SVGRectElement>;
  set: SVGAttributes<SVGSetElement>;
  stop: SVGAttributes<SVGStopElement>;
  symbol: SVGAttributes<SVGSymbolElement>;
  text: SVGAttributes<SVGTextElement>;
  textPath: SVGAttributes<SVGTextPathElement>;
  tspan: SVGAttributes<SVGTSpanElement>;
  use: SVGAttributes<SVGUseElement>;
  view: SVGAttributes<SVGViewElement>;

  title: HTMLAttributes<HTMLTitleElement> & SVGAttributes<SVGTitleElement>;

  [elemName: string]: Record<string, any> & { key?: string | number };
}
