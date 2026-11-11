import { CodeBlock } from "../components/CodeBlock";

export const PortalPage = () => (
  <div>
    <h1>Portal</h1>
    <p class="text-base-content/70">Render UI somewhere else in the document without giving up its component ownership.</p>
    <section>
      <p>
        <code>&lt;Portal&gt;</code> lets a component keep ownership of some UI while placing its DOM
        somewhere else in the document. This is useful for dialogs, menus, tooltips, and overlays
        that would otherwise be clipped or trapped by an ancestor's layout or stacking context.
      </p>

      <h2 class="mt-6">Put an overlay outside its parent layout</h2>
      <p>
        Give the portal an existing DOM element through its required <code>mount</code> prop. Once
        the component mounts in the browser, Vynn inserts the portal's children into that target.
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

      <h2 class="mt-6">What happens to portal content?</h2>
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

      <h2 class="mt-6">A server-rendering detail to plan for</h2>
      <p>
        <code>Portal</code> is client-only. During server rendering it returns <code>null</code>, so
        the portal's children are not part of the HTML sent by the server. Keep essential content in
        the normal component tree, or provide an accessible alternative for users who need that
        content before hydration.
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
