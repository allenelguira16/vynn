import { CodeBlock } from "../../../../components/code-block";

const ReactivityPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Core concepts</p>
    <h1>Reactivity</h1>
    <p class="lead">
      Vynn's reactive primitives connect data to the UI. Read a value, update it, and Vynn keeps
      dependent bindings in sync. You choose the kind of reactive value that best matches the data.
    </p>

    <h2>Choose the right primitive</h2>
    <div class="not-prose my-6 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Primitive</th>
            <th>What it represents</th>
            <th>Read it as</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>$state()</code>
            </td>
            <td>A writable value</td>
            <td>
              <code>state.value</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>$store()</code>
            </td>
            <td>A reactive object, array, or collection</td>
            <td>
              <code>store.property</code> or <code>store[index]</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>$computed()</code>
            </td>
            <td>A read-only derived value</td>
            <td>
              <code>computed.value</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>$effect()</code>
            </td>
            <td>A side effect that reacts to reads</td>
            <td>Runs its callback</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      The most important distinction is how you read the value. <code>$state()</code> and
      <code>$computed()</code> return reactive value objects that expose the current result through{" "}
      <code>.value</code>. <code>$store()</code> returns a proxy, so you read its properties and
      array items directly.
    </p>

    <h2>1. Use state for individual values</h2>
    <p>
      <code>$state()</code> creates a writable reactive value. Read it through
      <code>.value</code> and assign to the same property to update it.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $state } from "vynn";\n\nfunction Counter() {\n  const count = $state(0);\n\n  function increment() {\n    count.value += 1;\n  }\n\n  return (\n    <button onClick={increment}>\n      Count: {count.value}\n    </button>\n  );\n}'
      }
    />
    <p>
      A state value can hold strings, numbers, booleans, objects, arrays, or even functions. A
      normal function is stored as a value. An <em>async function</em> passed as the initializer is
      treated as an async getter instead; see <a href="/docs/core-concepts/async-ui">Async UI</a>.
    </p>
    <p>
      You can also provide a type without an initial value when the value will be assigned later:
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'type User = { id: string; name: string };\nconst selectedUser = $state<User>();\n\n// Until assigned, selectedUser.value is undefined.\nselectedUser.value = { id: "u-1", name: "Ada" };'
      }
    />

    <h2>2. Use stores for structured data</h2>
    <p>
      <code>$store()</code> creates a deeply reactive proxy for an object or an array. You can
      update nested properties and array entries directly; you do not need to replace the entire
      value or create a new state for every field.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $store } from "vynn";\n\nfunction Profile() {\n  const user = $store({\n    name: "Ada",\n    preferences: {\n      theme: "light",\n      notifications: true,\n    },\n  });\n\n  function enableDarkMode() {\n    user.preferences.theme = "dark";\n  }\n\n  return (\n    <section>\n      <h2>{user.name}</h2>\n      <p>Theme: {user.preferences.theme}</p>\n      <button onClick={enableDarkMode}>Use dark theme</button>\n    </section>\n  );\n}'
      }
    />
    <p>
      Vynn tracks reads at the property level. Reading <code>user.name</code> depends on that
      property; reading <code>user.preferences.theme</code> depends on the nested theme property.
      Adding, updating, or deleting a property also notifies consumers that depend on the object's
      structure.
    </p>

    <h3>Use a store for an array</h3>
    <p>
      Arrays are reactive stores too. Read their <code>length</code>, access items by index, iterate
      with methods such as <code>map()</code> and <code>filter()</code>, and mutate the same array
      with normal JavaScript methods. Nested objects inside the array are reactive as well.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $store } from "vynn";\n\ntype Todo = { id: number; title: string; done: boolean };\n\nfunction TodoList() {\n  const todos = $store<Todo[]>([\n    { id: 1, title: "Read the guide", done: false },\n    { id: 2, title: "Build something", done: false },\n  ]);\n  let nextId = 3;\n\n  const remaining = $computed(\n    () => todos.filter((todo) => !todo.done).length,\n  );\n\n  function addTodo() {\n    todos.push({ id: nextId++, title: "New task", done: false });\n  }\n\n  function removeTodo(todo: Todo) {\n    const index = todos.indexOf(todo);\n    if (index !== -1) todos.splice(index, 1);\n  }\n\n  return (\n    <section>\n      <p>{remaining.value} tasks remaining</p>\n      <button onClick={addTodo}>Add task</button>\n      <button onClick={() => todos.sort((a, b) => a.title.localeCompare(b.title))}>\n        Sort by title\n      </button>\n      <button onClick={() => todos.reverse()}>Reverse order</button>\n      <ul>\n        {todos.map((todo) => (\n          <li>\n            <button onClick={() => { todo.done = !todo.done; }}>\n              {todo.done ? "Reopen" : "Complete"}\n            </button>\n            <span>{todo.title}</span>\n            <button onClick={() => removeTodo(todo)}>Remove</button>\n          </li>\n        ))}\n      </ul>\n    </section>\n  );\n}'
      }
    />
    <p>
      This example uses <code>push()</code> to append, <code>splice()</code> to remove, and
      <code>sort()</code> and <code>reverse()</code> to reorder the same array. Changing
      <code>todo.done</code> updates the nested object, while <code>filter()</code> recalculates the
      remaining count. You can also replace an item directly with{" "}
      <code>todos[index] = nextTodo</code>
      or change <code>todos.length</code>; those writes are tracked too.
    </p>

    <p>
      Stores also support JavaScript collections such as <code>Map</code> and
      <code>Set</code>. Built-in values such as <code>Date</code> are not converted into reactive
      proxies. See <a href="/docs/core-concepts/advanced-reactivity">Advanced reactivity</a> for
      details and async stores.
    </p>

    <h2>3. Derive values with computed</h2>
    <p>
      Use <code>$computed()</code> when a value can be calculated from other reactive values. Vynn
      tracks the values read by the getter and refreshes the result when those dependencies change.
      The returned value is read-only.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $state } from "vynn";\n\nfunction Price() {\n  const quantity = $state(2);\n  const unitPrice = $state(15);\n  const total = $computed(() => quantity.value * unitPrice.value);\n\n  return (\n    <section>\n      <p>Quantity: {quantity.value}</p>\n      <p>Unit price: {unitPrice.value}</p>\n      <p>Total: {total.value}</p>\n      <button onClick={() => quantity.value++}>Add one</button>\n    </section>\n  );\n}'
      }
    />
    <p>
      Keep derived data in a computed value instead of copying it into another state value from an
      effect. That way there is one source of truth and the dependency is visible where the value is
      defined.
    </p>

    <h2>4. Use effects for external work</h2>
    <p>
      Use <code>$effect()</code> when a reactive change needs to synchronize something outside Vynn,
      such as the document title, a browser API, or a third-party subscription. It runs once
      immediately, then runs again when a reactive value read by the callback changes.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $effect, $state } from "vynn";\n\nfunction SearchBox() {\n  const query = $state("");\n\n  $effect(() => {\n    if (typeof document === "undefined") return;\n\n    document.title = query.value\n      ? "Search: " + query.value\n      : "Search";\n  });\n\n  return (\n    <input\n      value={query.value}\n      onInput={(event) => query.value = event.currentTarget.value}\n    />\n  );\n}'
      }
    />
    <p>
      The callback can return a cleanup function. Vynn runs that cleanup before the effect runs
      again and when the owning component is disposed. The function returned by
      <code>$effect()</code> can also be called to stop the effect manually.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        "$effect(() => {\n  const connection = connectToUpdates();\n\n  return () => {\n    connection.close();\n  };\n});"
      }
    />

    <h2>5. Read without subscribing</h2>
    <p>
      Sometimes an effect needs a value to perform work but should not re-run when that value
      changes. Wrap that read in <code>untrack()</code>. Reads inside the callback do not become
      dependencies of the currently active effect.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $effect, $state, untrack } from "vynn";\n\nconst name = $state("Ada");\nconst logLevel = $state("info");\n\n$effect(() => {\n  console.log(logLevel.value, untrack(() => name.value));\n});'
      }
    />

    <h2>When to use each primitive</h2>
    <ul>
      <li>
        Use <code>$state()</code> when one value needs to be read and changed.
      </li>
      <li>
        Use <code>$store()</code> when data is naturally a nested object, an array, or a collection.
      </li>
      <li>
        Use <code>$computed()</code> when a value can be derived from other reactive values.
      </li>
      <li>
        Use <code>$effect()</code> when you need to synchronize with an external system.
      </li>
    </ul>
    <p>
      Next, learn how dependency tracking behaves with async getters, lazy computed values, and
      nested stores in <a href="/docs/core-concepts/advanced-reactivity">Advanced reactivity</a>.
    </p>
  </article>
);


export default ReactivityPage;
