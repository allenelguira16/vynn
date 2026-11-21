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
    var tag=n.tagName.toLowerCase();
    if(tag==="title")return"title";
    if(tag==="meta"){
      if(n.hasAttribute("charset"))return"meta:charset";
      var v=n.getAttribute("name");
      if(v)return"meta:name:"+v.toLowerCase();
      v=n.getAttribute("property");
      if(v)return"meta:property:"+v.toLowerCase();
      v=n.getAttribute("http-equiv");
      if(v)return"meta:http-equiv:"+v.toLowerCase();
    }
    if(tag==="link"){
      var r=(n.getAttribute("rel")||"").toLowerCase(),href=n.getAttribute("href")||"";
      return r==="canonical"?"link:canonical":"link:"+r+":"+href;
    }
    return null;
  }
  function c(n){
    if(n.tagName.toLowerCase()!=="meta")return null;
    var property=(n.getAttribute("property")||"").toLowerCase();
    if(!property)return null;
    var roots=["og:image","og:video","og:audio","og:locale:alternate"];
    for(var i=0;i<roots.length;i++){
      var root=roots[i];
      if(property===root||property.indexOf(root+":")===0)return"meta:property:"+root;
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
  function restoreFallback(identity,tag,before){
    var f=document.head.querySelector('template[data-vynn-head-fallback]');
    if(!f)return false;
    var candidates=Array.prototype.slice.call(f.content.querySelectorAll(tag));
    for(var i=0;i<candidates.length;i++){
      var candidate=candidates[i];
      if(!candidate.hasAttribute("key")&&k(candidate)===identity){
        document.head.insertBefore(candidate,before);
        return true;
      }
    }
    return false;
  }
  var incoming=Array.prototype.slice.call(t.content.children);
  var incomingSet=new Set(incoming);
  var handled=new Set();
  var replacedCollections=new Set();
  incoming.forEach(function(n){
    if(handled.has(n))return;
    var collection=n.getAttribute("data-vynn-head-replace");
    if(collection){
      if(replacedCollections.has(collection))return;
      replacedCollections.add(collection);
      var related=incoming.filter(function(candidate){return c(candidate)===collection;});
      related.forEach(function(candidate){handled.add(candidate);});
      var existing=Array.prototype.slice.call(document.head.querySelectorAll("meta[property]")).filter(function(e){
        return c(e)===collection;
      });
      if(existing.length){
        var anchor=existing[0];
        related.forEach(function(candidate){
          candidate.removeAttribute("data-vynn-head-replace");
          document.head.insertBefore(candidate,anchor);
        });
        existing.forEach(preserve);
      }
      return;
    }
    var identity=n.getAttribute("key");
    if(!identity)return;
    var existing=Array.prototype.slice.call(document.head.querySelectorAll(n.tagName.toLowerCase())).filter(function(e){
      return e.getAttribute("key")===identity||k(e)===identity;
    });
    if(existing.length){
      document.head.insertBefore(n,existing[0]);
      existing.forEach(preserve);
    }
  });
  incoming.forEach(function(n){n.removeAttribute("data-vynn-head-replace");});
  Array.prototype.slice.call(document.head.querySelectorAll("[key]")).forEach(function(n){
    if(incomingSet.has(n)||n.getAttribute("key")==="meta:charset")return;
    restoreFallback(n.getAttribute("key"),n.tagName.toLowerCase(),n);
    n.remove();
  });
  document.head.append(t.content);
};`;
}

/** Encodes a complete head snapshot as a browser-side patch. */
export function renderHeadPatch(html: string): string {
  const serialized = JSON.stringify(html).replace(/</g, "\\u003c");
  return `<script>window.${APPLY_HEAD_PATCH_SSR_KEY}(${serialized});document.currentScript.remove();</script>`;
}
