import { $state } from "vynn";

type DemoItem = {
  id: number;
  title: string;
  detail: string;
  tone: "violet" | "cyan" | "amber";
};

const initialItems: DemoItem[] = [
  {
    id: 1,
    title: "Compile JSX once",
    detail: "Static markup becomes a reusable template definition.",
    tone: "violet",
  },
  {
    id: 2,
    title: "Bind reactive values",
    detail: "Expressions update their targeted DOM nodes directly.",
    tone: "cyan",
  },
  {
    id: 3,
    title: "Keep keyed identity",
    detail: "Moving an item moves its existing DOM range.",
    tone: "amber",
  },
];

export default function HomePage() {
  const count = $state(0);
  const items = $state(initialItems);
  const nextId = $state(4);

  const addItem = () => {
    const id = nextId.value;
    nextId.value += 1;
    items.value = [
      ...items.value,
      {
        id,
        title: "New keyed item " + id,
        detail: "This row is created, keyed, and reconciled by the new renderer.",
        tone: "violet",
      },
    ];
  };

  const moveFirst = () => {
    if (items.value.length < 2) return;
    const [first, ...rest] = items.value;
    items.value = [...rest, first!];
  };

  const removeLast = () => {
    items.value = items.value.slice(0, -1);
  };

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span></span> A different rendering path</div>
          <h1>Less framework<br /><em>between you and the DOM.</em></h1>
          <p>
            JSX compiled into static templates and fine-grained bindings.
            No legacy VNode renderer involved.
          </p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => count.value += 1}>
              Update counter <span aria-hidden="true">↗</span>
            </button>
            <span className="hero-note">Every click updates one text node.</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Render pipeline illustration">
          <div className="orbit orbit-one"></div>
          <div className="orbit orbit-two"></div>
          <div className="core-card">
            <div className="core-label">LIVE STATE</div>
            <div className="counter-value">{count.value}</div>
            <div className="core-caption">reactive updates</div>
            <div className="pulse-line"><span></span></div>
            <div className="core-footer">
              <span>template</span><b>→</b><span>DOM</span>
            </div>
          </div>
          <span className="float-tag tag-compiler">OXC</span>
          <span className="float-tag tag-binding">BINDINGS</span>
          <span className="float-tag tag-runtime">RUNTIME</span>
        </div>
      </section>

      <section className="metrics" aria-label="Renderer capabilities">
        <article className="metric-card">
          <span className="metric-index">01 / COMPILE</span>
          <strong>Static templates</strong>
          <p>Markup is parsed and hoisted once.</p>
        </article>
        <article className="metric-card">
          <span className="metric-index">02 / UPDATE</span>
          <strong>Direct bindings</strong>
          <p>Reactive accessors target known nodes.</p>
        </article>
        <article className="metric-card">
          <span className="metric-index">03 / RECONCILE</span>
          <strong>Keyed ranges</strong>
          <p>Existing nodes move instead of being recreated.</p>
        </article>
      </section>

      <section className="workbench">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span></span> Runtime playground</div>
            <h2>Keyed list reconciliation</h2>
          </div>
          <div className="item-count">{items.value.length} <span>items</span></div>
        </div>

        <div className="list-panel">
          <div className="list-toolbar">
            <div className="list-label"><span className="toolbar-dot"></span> DOM RANGE / ITEMS</div>
            <div className="toolbar-actions">
              <button className="button button-quiet" onClick={moveFirst}>Move first to end</button>
              <button className="button button-quiet" onClick={removeLast} disabled={items.value.length === 0}>Remove last</button>
              <button className="button button-add" onClick={addItem}>+ Add item</button>
            </div>
          </div>

          <ol className="item-list">
            {items.value.map((item, index) => (
              <li className="item-row" key={item.id}>
                <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                <span className={"item-symbol " + item.tone}></span>
                <span className="item-copy">
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className="item-key">key: {item.id}</span>
              </li>
            ))}
          </ol>
          <div className="list-footnote">
            <span className="footnote-icon">↳</span>
            Reorder the list and inspect the elements in DevTools. Existing keyed rows retain their DOM identity.
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>VYNN RENDER_NEW</span>
        <span>Integrated Vite app · file router · SSR + hydration</span>
      </footer>
    </>
  );
}
