import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { Await } from "../src/components/await";
import { Catch } from "../src/components/catch";
import { lazy } from "../src/components/lazy";
import { createContext } from "../src/context/provider-context";
import { $computed } from "../src/reactivity/computed";
import { $ssrComponent, $ssrHead, $ssrHeadGroup, renderToServerString } from "../src/server/ssr";
import { renderToServer as renderPublicServer } from "../src/server";
import { $ssrAttribute, $ssrChildren, $ssrJoin, $ssrText } from "../src/server/ssr-html";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("string-based SSR renderer", () => {
  it("routes the public renderToServer API to the string renderer", () => {
    const rendered = renderPublicServer(() => "<main>Public server API</main>", "sync");

    expect(rendered.body).toBe("<main>Public server API</main>");
  });
  it("renders provider children lazily under the provider owner", () => {
    const [NameProvider, useNameContext] = createContext<{ name: string }>();

    const Input = $ssrComponent(function Input() {
      const forms = useNameContext();
      return '<input value="' + forms.name + '">';
    });

    const Wrapper = $ssrComponent(function Wrapper(props: { children: unknown }) {
      return "<section>" + $ssrJoin(() => props.children, false) + "</section>";
    });

    const BoundProvider = $ssrComponent(function BoundProvider(props: { children: unknown }) {
      return NameProvider({
        get value() {
          return { name: "provided" };
        },
        get children() {
          return $ssrChildren(
            () => $ssrJoin(() => props.children, false),
          ) as unknown as import("../src/types/jsx").JSX.Element;
        },
      });
    });

    const Form = $ssrComponent(function Form(props: { children: unknown }) {
      return BoundProvider({
        get children() {
          return $ssrChildren(() => $ssrJoin(() => props.children, false));
        },
      });
    });

    const Page = $ssrComponent(function Page() {
      return Form({
        get children() {
          return $ssrChildren(() =>
            Wrapper({
              get children() {
                return $ssrChildren(() => Input());
              },
            }),
          );
        },
      });
    });

    const rendered = renderToServerString(() => Page(), "sync");

    expect(rendered.body).toBe("<section><input value=\"provided\"></section>");
  });

  it("serializes registered metadata into the head manager, not the body", () => {
    const rendered = renderToServerString(() => {
      $ssrHead("title", { get children() { return ["A ", "page"]; } });
      $ssrHead("meta", { get name() { return "description"; }, get content() { return "SSR page"; } });
      return "<main>Body</main>";
    }, "sync");

    expect(rendered.body).toBe("<main>Body</main>");
    expect(rendered.head.render()).toContain("<title key=\"title\">A page</title>");
    expect(rendered.head.render()).toContain("name=\"description\"");
  });

  it("keeps metadata registered by components inside a nested head group", () => {
    const rendered = renderToServerString(() => {
      $ssrHeadGroup(() => {
        $ssrHead("title", { get children() { return "Grouped"; } });
        $ssrHead("meta", { get property() { return "og:title"; }, get content() { return "Grouped page"; } });
        return [];
      });
      return "<main>Body</main>";
    }, "sync");

    expect(rendered.body).toBe("<main>Body</main>");
    expect(rendered.head.render()).toContain("<title key=\"title\">Grouped</title>");
    expect(rendered.head.render()).toContain("property=\"og:title\"");
  });
  it("resolves Await dynamic text slots without rerunning the component", async () => {
    let componentRuns = 0;

    const Page = $ssrComponent(function Page() {
      componentRuns++;
      const value = $computed(async () => {
        await Promise.resolve();
        return "<resolved>";
      });

      return Await({
        get fallback() {
          return "<i>Loading</i>";
        },
        get children() {
          return "<p>" + $ssrText(() => value.value) + "</p>";
        },
      });
    });

    const rendered = await renderToServerString(() => Page(), "async");

    expect(rendered.body).toContain("<p>&lt;resolved&gt;</p>");
    expect(rendered.body).not.toContain("Loading");
    expect(componentRuns).toBe(1);
  });

  it("renders Await fallback without waiting in sync mode", () => {
    const Page = $ssrComponent(function Page() {
      const value = $computed(async () => {
        await Promise.resolve();
        return "resolved";
      });

      return Await({
        get fallback() {
          return "<i>Loading</i>";
        },
        get children() {
          return "<p>" + $ssrText(() => value.value) + "</p>";
        },
      });
    });

    const rendered = renderToServerString(() => Page(), "sync");

    expect(rendered.body).toContain("<i>Loading</i>");
    expect(rendered.body).not.toContain("resolved");
  });

  it("streams initial Await fallback before the resolved string patch", async () => {
    const Page = $ssrComponent(function Page() {
      const value = $computed(async () => {
        await Promise.resolve();
        return "streamed";
      });

      return Await({
        get fallback() {
          return "<i>Loading</i>";
        },
        get children() {
          return "<p>" + $ssrText(() => value.value) + "</p>";
        },
      });
    });

    const rendered = renderToServerString(() => Page(), "stream");
    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();

    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(decoder.decode(first.value)).toContain("<i>Loading</i>");
    const initialHtml = decoder.decode(first.value);
    expect(initialHtml).toContain("<!--a:f-->");
    expect(initialHtml).toContain("<!--f:");
    expect(initialHtml).toContain("<!--/f:");

    const remaining: string[] = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      remaining.push(decoder.decode(result.value));
    }

    const patch = remaining.join("");
    expect(patch).toContain('data-vynn-ssr-patch="');
    expect(patch).toContain("<!--a:r-->");
    expect(patch).toContain("<p>streamed</p>");
  });

  it("resolves pending attributes without rerunning their component", async () => {
    let componentRuns = 0;

    const Page = $ssrComponent(function Page() {
      componentRuns++;
      const title = $computed(async () => {
        await Promise.resolve();
        return "<safe>";
      });

      return "<button" + $ssrAttribute("title", () => title.value) + ">Save</button>";
    });

    const rendered = await renderToServerString(() => Page(), "async");

    expect(rendered.body).toContain('<button title="&lt;safe&gt;">Save</button>');
    expect(rendered.body).not.toContain("data-vynn-ssr-pending-attr");
    expect(componentRuns).toBe(1);
  });
  it("resolves lazy components through the string SSR boundary", async () => {
    let loaderRuns = 0;

    const Profile = $ssrComponent(function Profile(_props: {}) {
      return "<p>Lazy profile</p>";
    });
    const LazyProfile = lazy(async () => {
      loaderRuns++;
      await Promise.resolve();
      return { default: Profile };
    }, undefined, "profile-module");

    const Page = $ssrComponent(function Page() {
      return "<main>" + LazyProfile({}) + "</main>";
    });

    const rendered = await renderToServerString(() => Page(), "async");

    expect(rendered.body).toContain("<main>");
    expect(rendered.body).toContain("<p>Lazy profile</p>");
    expect(rendered.body).toContain("<!--l:");
    expect(rendered.body).toContain("<!--/l:");
    expect(rendered.body).not.toContain("<!--f:");
    expect(rendered.modules.has("profile-module")).toBe(true);
    expect(loaderRuns).toBe(1);
  });

  it("routes an Await slot rejection to a Catch surrounding the boundary", async () => {
    const Page = $ssrComponent(function Page() {
      const value = $computed(async () => {
        await Promise.resolve();
        throw new Error("awaited profile unavailable");
      });

      return Catch({
        get children() {
          return Await({
            get fallback() { return "<i>Loading profile</i>"; },
            get children() { return "<p>" + $ssrText(() => value.value) + "</p>"; },
          });
        },
        fallback(error) {
          return "<strong>Caught: " + error.message + "</strong>";
        },
      });
    });

    const rendered = await renderToServerString(() => Page(), "async");

    expect(rendered.body).toContain("<strong>Caught: awaited profile unavailable</strong>");
    expect(rendered.body).not.toContain("Loading profile");
    expect(rendered.body).not.toContain("<!--s:");
  });
  it("streams a Catch fallback patch when Await content rejects", async () => {
    const Page = $ssrComponent(function Page() {
      const value = $computed(async () => {
        await Promise.resolve();
        throw new Error("stream profile unavailable");
      });

      return Catch({
        get children() {
          return Await({
            get fallback() { return "<i>Loading profile</i>"; },
            get children() { return "<p>" + $ssrText(() => value.value) + "</p>"; },
          });
        },
        fallback(error) {
          return "<strong>Caught: " + error.message + "</strong>";
        },
      });
    });

    const rendered = renderToServerString(() => Page(), "stream");
    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();

    const initial = await reader.read();
    expect(initial.done).toBe(false);
    const initialHtml = decoder.decode(initial.value);
    expect(initialHtml).toContain("Loading profile");
    expect(initialHtml).toContain("<!--eb:");
    expect(initialHtml).toContain("<!--/eb:");

    const patches: string[] = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      patches.push(decoder.decode(result.value));
    }

    const output = patches.join("");
    expect(output).toContain('data-vynn-ssr-error-patch="');
    expect(output).toContain("Caught: stream profile unavailable");
    expect(output).not.toContain("<!--s:");
  });

  it("waits for a parent Await patch before streaming nested Await patches", async () => {
    const parent = deferred<void>();
    const child = deferred<void>();

    const Page = $ssrComponent(function Page() {
      const parentValue = $computed(async () => {
        await parent.promise;
        return "parent-ready";
      });
      const childValue = $computed(async () => {
        await child.promise;
        return "child-ready";
      });

      return Await({
        get fallback() { return "<i>Parent loading</i>"; },
        get children() {
          return "<section>" + $ssrText(() => parentValue.value) + Await({
            get fallback() { return "<i>Child loading</i>"; },
            get children() { return "<span>" + $ssrText(() => childValue.value) + "</span>"; },
          }) + "</section>";
        },
      });
    });

    const rendered = renderToServerString(() => Page(), "stream");
    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();
    const initial = await reader.read();
    expect(decoder.decode(initial.value)).toContain("Parent loading");
    expect(decoder.decode(initial.value)).not.toContain("Child loading");

    child.resolve();
    parent.resolve();

    const parentPatch = await reader.read();
    const parentChunk = decoder.decode(parentPatch.value);
    expect(parentChunk).toContain("parent-ready");
    expect(parentChunk).toContain("Child loading");
    expect(parentChunk).not.toContain("child-ready");

    const childPatch = await reader.read();
    expect(decoder.decode(childPatch.value)).toContain("child-ready");

    expect((await reader.read()).done).toBe(true);
  });
  it("streams ready sibling Await boundaries without waiting for slower ones", async () => {
    const slow = deferred<void>();
    const fast = deferred<void>();

    const Page = $ssrComponent(function Page() {
      const slowValue = $computed(async () => {
        await slow.promise;
        return "slow-ready";
      });
      const fastValue = $computed(async () => {
        await fast.promise;
        return "fast-ready";
      });

      return [
        Await({
          get fallback() { return "<i>slow-loading</i>"; },
          get children() { return "<p>" + $ssrText(() => slowValue.value) + "</p>"; },
        }),
        Await({
          get fallback() { return "<i>fast-loading</i>"; },
          get children() { return "<p>" + $ssrText(() => fastValue.value) + "</p>"; },
        }),
      ];
    });

    const rendered = renderToServerString(() => Page(), "stream");
    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();
    const initial = await reader.read();
    expect(decoder.decode(initial.value)).toContain("slow-loading");
    expect(decoder.decode(initial.value)).toContain("fast-loading");

    fast.resolve();
    const fastPatch = await reader.read();
    expect(decoder.decode(fastPatch.value)).toContain("fast-ready");
    expect(decoder.decode(fastPatch.value)).not.toContain("slow-ready");

    slow.resolve();
    const slowPatch = await reader.read();
    expect(decoder.decode(slowPatch.value)).toContain("slow-ready");

    const final = await reader.read();
    expect(final.done).toBe(true);
  });
  it("streams a nested lazy import before an unrelated slow Await", async () => {
    const parentModule = deferred<{ default: () => JSX.Element }>();
    const nestedModule = deferred<{ default: () => JSX.Element }>();
    const sibling = deferred<void>();

    const Nested = $ssrComponent(() => "<p>Nested lazy ready</p>");
    const NestedLazy = lazy(() => nestedModule.promise, undefined, "nested-lazy-module");
    const Parent = $ssrComponent(() =>
      Await({
        get fallback() { return "<i>Nested lazy loading</i>"; },
        get children() { return NestedLazy(undefined as never); },
      }),
    );
    const ParentLazy = lazy(() => parentModule.promise, undefined, "parent-lazy-module");

    const Page = $ssrComponent(() => {
      const siblingValue = $computed(async () => {
        await sibling.promise;
        return "Slow sibling ready";
      });

      return [
        Await({
          get fallback() { return "<i>Parent lazy loading</i>"; },
          get children() { return ParentLazy(undefined as never); },
        }),
        Await({
          get fallback() { return "<i>Slow sibling loading</i>"; },
          get children() {
            return "<p>" + $ssrText(() => siblingValue.value) + "</p>";
          },
        }),
      ];
    });

    const rendered = renderToServerString(() => Page(), "stream");
    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();

    try {
      const initial = await reader.read();
      const initialHtml = decoder.decode(initial.value);
      expect(initialHtml).toContain("Parent lazy loading");
      expect(initialHtml).toContain("Slow sibling loading");
      expect(initialHtml).not.toContain("Nested lazy ready");

      parentModule.resolve({ default: Parent });

      const parentPatch = await reader.read();
      const parentHtml = decoder.decode(parentPatch.value);
      expect(parentHtml).toContain("Nested lazy loading");
      expect(parentHtml).not.toContain("Nested lazy ready");

      nestedModule.resolve({ default: Nested });

      const nestedRead = reader.read();
      const nestedOutcome = await Promise.race([
        nestedRead.then((result) => ({ kind: "chunk" as const, result })),
        new Promise<{ kind: "blocked" }>((resolve) =>
          setTimeout(() => resolve({ kind: "blocked" }), 250),
        ),
      ]);

      expect(nestedOutcome.kind).toBe("chunk");
      if (nestedOutcome.kind === "chunk") {
        expect(decoder.decode(nestedOutcome.result.value)).toContain("Nested lazy ready");
      }
    } finally {
      sibling.resolve();
      parentModule.resolve({ default: Parent });
      nestedModule.resolve({ default: Nested });
    }

    while (true) {
      const result = await reader.read();
      if (result.done) break;
    }
  });

  it("routes rejected dynamic resources to the nearest Catch", async () => {
    const Page = $ssrComponent(function Page() {
      const value = $computed(async () => {
        await Promise.resolve();
        throw new Error("profile unavailable");
      });

      return Catch({
        get children() {
          return "<p>" + $ssrText(() => value.value) + "</p>";
        },
        fallback(error) {
          return "<strong>Caught: " + error.message + "</strong>";
        },
      });
    });

    const rendered = await renderToServerString(() => Page(), "async");

    expect(rendered.body).toContain("<strong>Caught: profile unavailable</strong>");
    expect(rendered.body).toContain('"status":"fallback"');
    expect(rendered.body).toContain('"message":"profile unavailable"');
    expect(rendered.body).not.toContain("<!--s:");
  });
});
