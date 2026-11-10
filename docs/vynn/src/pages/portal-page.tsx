import { CodeBlock } from "../components/CodeBlock";

export const PortalPage = () => (
  <div>
    <h1>Portal</h1>
    <section>
      <p>
        <code>&lt;Portal&gt;</code> renders its children into a DOM element outside the component's
        normal DOM position. This is useful for dialogs, popovers, menus, tooltips, and overlays
        that need to escape an ancestor's layout or stacking context.
      </p>

      <h2 class="mt-6">Basic usage</h2>
      <p>
        Pass an existing DOM element through the required <code>mount</code>
        prop. The portal inserts its children into that target after the component mounts in the
        browser.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { Portal } from "vynn";

function App(props: { overlayRoot: HTMLElement }) {
  return (
    <main>
      <h1>Dashboard</h1>
      <Portal mount={props.overlayRoot}>
        <div class="dialog-backdrop">
          <section role="dialog" aria-modal="true">
            <h2>Account settings</h2>
            <p>This content is mounted in the overlay root.</p>
          </section>
        </div>
      </Portal>
    </main>
  );
}
      `}
      />

      <p>
        The <code>overlayRoot</code> should be obtained in browser code after the document exists
        and passed to the application. For example, an application shell can include a dedicated
        <code>&lt;div id="overlays"&gt;</code> next to its main mount point.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { renderToDOM } from "vynn/client";

const overlayRoot = document.getElementById("overlays");

if (!overlayRoot) {
  throw new Error("Missing #overlays element");
}

renderToDOM(() => <App overlayRoot={overlayRoot} />, "#app");
      `}
      />

      <h2 class="mt-6">Portal lifecycle</h2>
      <ul>
        <li>The portal's children are inserted into the supplied target after mount.</li>
        <li>
          The portal returns <code>null</code> at its original location.
        </li>
        <li>
          The portal is tied to its owning component and its content is disposed with that owner.
        </li>
        <li>The target should be an existing DOM element when the mount callback runs.</li>
      </ul>

      <h2 class="mt-6">Server rendering</h2>
      <p>
        <code>Portal</code> is client-only in the current core implementation. It returns{" "}
        <code>null</code> during server rendering, so the portal children are not included in the
        server HTML. Do not rely on portal content being present in the initial SSR document. Render
        essential content in the normal tree or provide an accessible non-portal fallback when that
        content must exist before hydration.
      </p>

      <h2 class="mt-6">API reference</h2>
      <h3>
        <code>&lt;Portal mount=&#123;element&#125;&gt;...&lt;/Portal&gt;</code>
      </h3>
      <p>
        <code>mount</code> is an existing DOM <code>Element</code> that receives the children on the
        client. The component requires children and does not render a placeholder at its original
        position.
      </p>
    </section>
  </div>
);
