import { CodeBlock } from "../components/code-block";

export const AdvancedReactivityPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Core concepts</p>
    <h1>Advanced reactivity</h1>
    <p class="lead">
      Once the basics make sense, the next step is understanding when Vynn tracks a dependency, what
      happens during an async refresh, and how to keep larger reactive structures predictable.
    </p>

    <h2>How dependency tracking works</h2>
    <p>
      Vynn records reactive values that are read while a reactive computation is running. When one
      of those values changes, the computation is scheduled again. Dependencies are collected from
      actual reads, not from variable names or TypeScript types.
    </p>
    <p>
      For example, this computed value depends on <code>includeTax</code> and on the price values
      from whichever branch is active:
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $state } from "vynn";\n\nconst includeTax = $state(false);\nconst subtotal = $state(100);\nconst taxRate = $state(0.12);\n\nconst total = $computed(() => {\n  if (!includeTax.value) return subtotal.value;\n  return subtotal.value * (1 + taxRate.value);\n});'
      }
    />
    <p>
      When the branch changes, the next evaluation collects the dependencies used by that branch.
      This keeps updates focused on the values the current computation actually reads.
    </p>

    <h2>Async getters and the first await</h2>
    <p>
      Async <code>$state()</code>, <code>$computed()</code>, and <code>$store()</code> getters
      establish reactive dependencies while the getter is first executing synchronously. In an
      <code>async</code> function, that means reads before the first <code>await</code> are tracked.
      Reads after an <code>await</code> happen after the getter has returned its promise and are not
      collected as dependencies of that run.
    </p>
    <p>Capture the reactive input before awaiting, then use the captured value for the request:</p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $state } from "vynn";\n\nconst userId = $state("42");\n\nconst user = $computed(async () => {\n  // This read is tracked. Changing userId starts a new request.\n  const id = userId.value;\n\n  const response = await fetch("/api/users/" + id);\n  if (!response.ok) throw new Error("User not found.");\n\n  return (await response.json()) as { name: string };\n});'
      }
    />
    <p>
      Avoid reading a reactive value for the first time only after the
      <code>await</code> when you expect that value to trigger a refresh. Capture it near the top of
      the getter instead.
    </p>

    <h2>Refreshes keep the last resolved value</h2>
    <p>
      Async-derived state and computed values retain their most recent successful value while a
      replacement request is pending. This lets a screen continue showing useful content while fresh
      data is loading. A first read with no resolved value can suspend and be handled by an
      <code>Await</code> boundary.
    </p>
    <p>
      Use <code>isPending()</code> when the UI needs to show that a value is refreshing without
      replacing the current content:
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { Await, $state, isPending } from "vynn";\n\nfunction RefreshingProfile() {\n  const profile = $state(async () => {\n    const response = await fetch("/api/profile");\n    if (!response.ok) throw new Error("Could not load profile.");\n    return (await response.json()) as { name: string };\n  });\n\n  return (\n    <Await fallback={<p>Loading profile...</p>}>\n      <section>\n        <p>{profile.value.name}</p>\n        {isPending(profile) && <span>Refreshing...</span>}\n      </section>\n    </Await>\n  );\n}'
      }
    />

    <h2>Use lazy computed values when useful</h2>
    <p>
      Computed values evaluate eagerly by default. Pass <code>{"{ lazy: true }"}</code> to defer the
      first evaluation until the value is read. This can be useful for expensive derived work that
      may never be needed on a particular route or screen.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $state } from "vynn";\n\nconst data = $state({ value: 10 });\nconst report = $computed(() => buildExpensiveReport(data.value), { lazy: true });\n\n// The getter starts when report.value is first read.\nconst firstSection = report.value.sections[0];'
      }
    />
    <p>
      Lazy evaluation changes when the first computation starts; it does not turn the computed value
      into writable state. The value remains read-only.
    </p>

    <h2>Stores track structure as well as values</h2>
    <p>
      A store tracks property reads, existence checks such as the <code>in</code> operator and
      <code>hasOwnProperty()</code>, and iteration separately. This means a component that reads one
      field does not need to re-run merely because an unrelated field changed. A component that
      iterates over the object can also react when keys are added or removed.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $store } from "vynn";\n\nconst settings = $store({ theme: "light", density: "comfortable" });\n\n// A component that only reads settings.theme depends on that property.\nconst currentTheme = $computed(() => settings.theme);\n\n// Adding a key also updates consumers that enumerate the settings object.\nsettings.shortcuts = true;'
      }
    />
    <p>
      Store properties also support ordinary JavaScript getters and methods. A getter runs with the
      reactive store as <code>this</code>, so the properties it reads become dependencies. A method
      can read and write through <code>this</code> just like it would on a plain object.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $store } from "vynn";\n\nconst cart = $store({\n  quantity: 2,\n  unitPrice: 15,\n  get total() {\n    return this.quantity * this.unitPrice;\n  },\n  addOne() {\n    this.quantity += 1;\n  },\n});\n\nconsole.log(cart.total); // 30\ncart.addOne();\nconsole.log(cart.total); // 45'
      }
    />
    <p>
      Arrays and collection types have collection-aware tracking for their supported operations.
      Stores support <code>Map</code>, <code>Set</code>, <code>WeakMap</code>, and
      <code>WeakSet</code> values as well as ordinary objects and arrays. Weak collections keep
      their native non-iterable behavior. Built-in values such as <code>Date</code>,
      <code>RegExp</code>, other unsupported class instances, and non-extensible objects (including
      frozen and sealed objects) are not converted into reactive proxies. The following examples
      show how to use arrays and the collection methods directly.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $store } from "vynn";\n\nconst todos = $store([\n  { id: 1, title: "Read the guide", done: false },\n]);\n\nconst remaining = $computed(() =>\n  todos.filter((todo) => !todo.done).length,\n);\n\n// Array mutations and nested object changes are reactive.\ntodos.push({ id: 2, title: "Build an app", done: false });\ntodos[0].done = true;\n\nconst stock = $store(new Map([["apples", 3]]));\nconst selected = $store(new Set(["apples"]));\n\nconst appleCount = $computed(() => stock.get("apples") ?? 0);\nconst selectedNames = $computed(() => Array.from(selected).join(", "));\n\nstock.set("apples", appleCount.value + 1);\nselected.add("oranges");\nselected.delete("apples");'
      }
    />
    <p>
      Array reads through an index, <code>length</code>, and iteration are tracked. Vynn also tracks
      the results of array search methods such as <code>includes()</code>,<code>indexOf()</code>,
      and <code>lastIndexOf()</code>, plus iteration methods including
      <code>map()</code>, <code>filter()</code>, <code>find()</code>, <code>findIndex()</code>,
      <code>findLast()</code>, <code>findLastIndex()</code>, <code>some()</code>,
      <code>every()</code>, <code>reduce()</code>, <code>reduceRight()</code>, <code>flat()</code>,
      <code>flatMap()</code>, and <code>forEach()</code>.
    </p>
    <p>
      Direct index and length assignments are reactive. The mutating array methods
      <code>copyWithin()</code>, <code>fill()</code>, <code>pop()</code>, <code>push()</code>,
      <code>reverse()</code>, <code>shift()</code>, <code>sort()</code>, <code>splice()</code>, and{" "}
      <code>unshift()</code> also notify the dependencies affected by the change. These methods
      mutate the existing store array; they do not require a replacement array. Each mutating method
      runs inside a reactive transaction, so its internal writes are committed together. Internal
      bookkeeping reads are untracked and do not accidentally become dependencies of the active
      effect.
    </p>
    <p>
      The array's <code>keys()</code>, <code>values()</code>, <code>entries()</code>, and
      <code>Symbol.iterator</code> are tracked too. That includes common iteration syntax such as{" "}
      <code>for...of</code> and spread. Search methods also handle both the original object and its
      reactive proxy: <code>includes()</code> and <code>indexOf()</code> can find an item whether
      you pass the raw object or the value read back from the store. The same identity handling
      applies to <code>lastIndexOf()</code>.
    </p>
    <p>
      Other native methods such as <code>at()</code>, <code>slice()</code>, <code>concat()</code>,
      and <code>join()</code> also read through the proxy, so the index and length reads they
      perform are tracked normally. Methods that return a copied array, such as
      <code>slice()</code> and <code>concat()</code>, return a regular array. Wrap that result in
      <code>$store()</code> when the copy itself also needs to be reactive.
    </p>
    <p>
      Deleting an array index with <code>delete items[index]</code> creates a hole. It triggers
      array iteration updates, but it does not reduce <code>length</code> or shift later items. Use{" "}
      <code>splice()</code> when you want to remove an item and close the gap.
    </p>
    <p>
      For a <code>Map</code>, reads through <code>get()</code> and <code>has()</code>, its
      <code>size</code>, and iteration are tracked. A <code>Set</code> tracks <code>has()</code>,
      <code>size</code>, and iteration. Use the native <code>set()</code>, <code>add()</code>,
      <code>delete()</code>, and <code>clear()</code> methods to update them.
    </p>
    <p>
      A <code>Map</code> tracks individual keys separately from key iteration. A computed value that
      calls <code>map.get("ada")</code> updates when that entry changes, while a computed value that
      only iterates over <code>map.keys()</code> updates when keys are added or removed, not when an
      existing entry's value is replaced.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $store } from "vynn";\n\nconst users = $store(new Map([["ada", { name: "Ada" }]]));\nconst adaName = $computed(() => users.get("ada")?.name ?? "Missing");\nconst userIds = $computed(() => [...users.keys()]);\n\n// Updates the entry value, but not the set of keys.\nusers.set("ada", { name: "Grace" });\n\n// Adding a key also updates computations that iterate over keys.\nusers.set("lin", { name: "Lin" });'
      }
    />
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $store } from "vynn";\n\nconst metadata = $store(new WeakMap<object, { active: boolean }>());\nconst blocked = $store(new WeakSet<object>());\nconst record = {};\n\nmetadata.set(record, { active: true });\nconst isActive = $computed(() => metadata.get(record)?.active ?? false);\nconst isBlocked = $computed(() => blocked.has(record));\n\nmetadata.set(record, { active: false });\nblocked.add(record);'
      }
    />

    <p>
      <code>WeakMap</code> and <code>WeakSet</code> support key-based <code>get()</code>,
      <code>has()</code>, <code>set()</code>, <code>add()</code>, and <code>delete()</code>
      tracking. They intentionally keep JavaScript's weak-collection behavior: there is no
      <code>size</code> and no way to enumerate their entries. Use <code>Map</code> or
      <code>Set</code> when the UI needs to display or iterate over the full collection.
    </p>
    <h2>Reactive values inside stores</h2>
    <p>
      When a Vynn <code>$state()</code> or <code>$computed()</code> value is stored on an ordinary
      object property, the store exposes its current value directly. You can read
      <code>settings.title</code> instead of <code>settings.title.value</code>. Assigning a normal
      value to a property backed by writable <code>$state()</code> updates that state value. A
      property backed by read-only <code>$computed()</code> stays read-only.
    </p>
    <p>
      Arrays and collections behave differently: they keep <code>$state()</code> and
      <code>$computed()</code> values as objects. Read or update their contents through
      <code>.value</code>, just as you would outside a store.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $state, $store } from "vynn";\n\nconst title = $state("Draft");\nconst visits = $state(0);\nconst titleLength = $computed(() => title.value.length);\n\n// Object properties expose the current values directly.\nconst settings = $store({ title, titleLength });\nconsole.log(settings.title); // "Draft"\nconsole.log(settings.titleLength); // 5\n\n// Writing to a property containing writable state updates that state.\nsettings.title = "Published";\nconsole.log(title.value); // "Published"\n\n// Arrays keep state values as state objects. Access .value explicitly.\nconst labels = $store([title]);\nlabels[0].value = "Archived";\nconsole.log(title.value); // "Archived"\n\n// Map values also keep their state objects.\nconst counters = $store(new Map([["visits", visits]]));\ncounters.get("visits")!.value += 1;\nconsole.log(visits.value); // 1'
      }
    />

    <h2>Async stores reconcile object snapshots</h2>
    <p>
      An async initializer passed to <code>$store()</code> must resolve to a plain object. Vynn
      keeps the same root proxy and reconciles compatible nested objects and arrays when a new
      snapshot arrives. That means components can keep reading the same store reference across
      refreshes. Nested arrays are reconciled in place, so a reference to the array itself stays
      stable. When an incoming snapshot replaces an object at an array index, that entry gets a new
      object identity. Avoid keeping references to individual array entries across refreshes unless
      your data layer provides stable objects.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $store } from "vynn";\n\ntype DashboardData = {\n  title: string;\n  stats: { visits: number };\n  items: { id: number; label: string }[];\n};\n\nconst dashboard = $store(async (): Promise<DashboardData> => {\n  const response = await fetch("/api/dashboard");\n  if (!response.ok) throw new Error("Dashboard unavailable.");\n  return (await response.json()) as DashboardData;\n});\n\n// The root store and nested array keep their identities across refreshes.\nconst items = dashboard.items;\n\n// An object entry can be replaced by the next server snapshot.\nconst firstItem = items[0];'
      }
    />
    <p>
      Do not use an async store initializer for an array, <code>Date</code>, <code>Map</code>, or
      another non-plain-object root. Use <code>$state()</code> or <code>$computed()</code> when the
      resource result should be a single value instead.
    </p>

    <h2>Manual assignment supersedes an older request</h2>
    <p>
      Async state can still be assigned manually through <code>.value</code>. Assigning a value
      invalidates the outstanding computation so an older request cannot overwrite the value you
      just set. Vynn also ignores settlements from async computations that have already been
      superseded by a newer run.
    </p>

    <h2>Common mistakes</h2>
    <ul>
      <li>
        Reading <code>state</code> instead of <code>state.value</code> for a value created with
        <code>$state()</code> or <code>$computed()</code>.
      </li>
      <li>
        Expecting a regular function passed to <code>$state()</code> to run as a getter. Async
        function syntax is what identifies an async initializer.
      </li>
      <li>
        Reading a reactive dependency for the first time after an <code>await</code> and expecting
        it to trigger another computation.
      </li>
      <li>
        Using <code>$effect()</code> to copy one reactive value into another instead of deriving the
        second value with <code>$computed()</code>.
      </li>
    </ul>
  </article>
);
