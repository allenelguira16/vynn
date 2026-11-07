import { CodeBlock } from "../components/CodeBlock";

export const EffectPage = () => {
  return (
    <div>
      <h1>effect</h1>
      <section>
        <p>
          <code>effect</code> runs a function whenever any reactive value used inside it changes. It
          automatically tracks dependencies like <code>state</code>, <code>store</code>, or
          <code>computed</code>—you don't need to manually list them.
        </p>
        <p>
          It's great for performing side effects like logging, syncing, or triggering animations
          whenever reactive values update.
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            import { createApp, state, effect } from "vynn";

            function Counter() {
              const count = state(0);

              const handleCount = () => {
                count.value++;
              };

              effect(() => {
                console.log("Count is now:", count.value);
              });

              return (
                <div>
                  <div>Count: {count.value}</div>
                  <button disabled={count.value > 5} onClick={handleCount}>
                    Add counter
                  </button>
                  <div>{count.value <= 3 ? <div>Hi</div> : "string"}</div>
                </div>
              );
            }

            createApp(Counter).mount("#app");
          `}
        />
        <h2 class="mt-6">Async support? Absolutely.</h2>
        <p>
          You can also use <code>async</code> functions inside <code>effect</code>. Vynn will wait
          for them to finish before re-running or cleaning up.
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            effect(async () => {
              await new Promise(resolve => setTimeout(resolve, 500));
              console.log("Delayed log:", count.value);
            });
          `}
        />

        <h2 class="mt-6">It can also return a cleanup function</h2>
        <p>
          If your effect sets up something that needs to be torn down (like an interval or event
          listener), you can return a function from <code>effect</code>. Vynn will call it before
          re-running the effect or when the component is removed.
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            effect(() => {
              const id = setInterval(() => {
                console.log("Tick", count.value);
              }, 1000);

              return () => {
                clearInterval(id); // Clean up on re-run or unmount
              };
            });
          `}
        />
      </section>
    </div>
  );
};
