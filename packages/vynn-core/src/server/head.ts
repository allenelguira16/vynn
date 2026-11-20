import { APPLY_HEAD_PATCH_SSR_KEY } from "../const";
import {
  type HeadContext,
  type HeadEntry,
  getHeadWinners,
  subscribeHeadContext,
} from "../context/head-context";
import { assertSafeAttributeName } from "../render/attribute-name";
import { escapeHtml } from "../utils/escape-html";

const voidElements = new Set(["meta", "link"]);

function serializeAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => {
      assertSafeAttributeName(name);
      return `${name}="${escapeHtml(value)}"`;
    })
    .join(" ");
}

function serializeHeadEntry(entry: HeadEntry): string {
  const attributes = {
    ...entry.attributes,
    key: entry.identity,
    ...(entry.group && entry.collectionRoot && entry.collection
      ? { "data-vynn-head-replace": entry.collection }
      : {}),
  };
  const serializedAttributes = serializeAttributes(attributes);
  const suffix = serializedAttributes ? ` ${serializedAttributes}` : "";

  if (voidElements.has(entry.tag)) {
    return `<${entry.tag}${suffix}>`;
  }

  return `<${entry.tag}${suffix}>${escapeHtml(entry.children)}</${entry.tag}>`;
}

export function renderSsrHead(context: HeadContext): string {
  return getHeadWinners(context).map(serializeHeadEntry).join("");
}

export interface SsrHeadManager {
  render(): string;
  subscribe(listener: (html: string) => void): () => void;
}

/** Creates an explicit head handle for one SSR render. */
export function createSsrHeadManager(context: HeadContext): SsrHeadManager {
  const render = () => {
    return getHeadWinners(context).map(serializeHeadEntry).join("");
  };

  return {
    render,
    subscribe(listener) {
      return subscribeHeadContext(context, () => listener(render()));
    },
  };
}

/**
 * Installs the browser-side handler used by streamed document-head updates.
 * Both SSR streaming renderers include this in their initial runtime chunk.
 */
export function renderHeadPatchRuntime(): string {
  return `window.${APPLY_HEAD_PATCH_SSR_KEY}=window.${APPLY_HEAD_PATCH_SSR_KEY}||function(h){
    var t=document.createElement("template");
    t.innerHTML=h;
    function k(n){
      var t=n.tagName.toLowerCase();
      if(t==="title")return"title";
      if(t==="meta"){
        if(n.hasAttribute("charset"))return"meta:charset";
        var v=n.getAttribute("name");
        if(v)return"meta:name:"+v.toLowerCase();
        v=n.getAttribute("property");
        if(v)return"meta:property:"+v.toLowerCase();
        v=n.getAttribute("http-equiv");
        if(v)return"meta:http-equiv:"+v.toLowerCase();
      }
      if(t==="link"){
        var r=(n.getAttribute("rel")||"").toLowerCase(),h=n.getAttribute("href")||"";
        return r==="canonical"?"link:canonical":"link:"+r+":"+h;
      }
      return null;
    }
    function preserve(e){
      if(!e.hasAttribute("key")){
        var f=document.head.querySelector('template[data-vynn-head-fallback]');
        if(!f){
          f=document.createElement("template");
          f.setAttribute("data-vynn-head-fallback","");
          document.head.append(f);
        }
        f.content.append(e);
      }else{
        e.remove();
      }
    }
    t.content.querySelectorAll("[data-vynn-head-replace]").forEach(function(n){
      var c=n.getAttribute("data-vynn-head-replace");
      document.head.querySelectorAll("meta[property]").forEach(function(e){
        var p="meta:property:"+(e.getAttribute("property")||"").toLowerCase();
        if(p===c||p.indexOf(c+":")===0)preserve(e);
      });
    });
    t.content.querySelectorAll("[key]").forEach(function(n){
      var v=n.getAttribute("key");
      document.head.querySelectorAll(n.tagName.toLowerCase()).forEach(function(e){
        if(e.getAttribute("key")===v||(!n.hasAttribute("data-vynn-head-replace")&&k(e)===v))preserve(e);
      });
    });
    t.content.querySelectorAll("[data-vynn-head-replace]").forEach(function(n){
      n.removeAttribute("data-vynn-head-replace");
    });
    document.head.querySelectorAll("[key]").forEach(function(n){n.remove();});
    document.head.append(t.content);
  };`;
}

/** Encodes a complete head snapshot as a browser-side patch. */
export function renderHeadPatch(html: string): string {
  const serialized = JSON.stringify(html).replace(/</g, "\\u003c");
  return `<script>window.${APPLY_HEAD_PATCH_SSR_KEY}(${serialized});document.currentScript.remove();</script>`;
}
