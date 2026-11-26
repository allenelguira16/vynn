# render_new browser sandbox

This app uses Vynn's integrated Vite application plugin with the new renderer
selected explicitly. It no longer installs a standalone JSX transform or calls
the renderer manually.

From the repository root:

```sh
pnpm install
pnpm --filter render-new-app dev
```

Open http://localhost:3001.

The app returns a complete `<html>` document from `src/App.tsx`. Vynn
prepares the render tree, serializes the document on the server, injects the
browser assets, then prepares the client tree before hydrating the existing
`document.documentElement`. The playground includes a reactive counter and
a keyed list so DOM identity can be inspected while rows are reordered,
added, and removed.

The Vite config uses:

```ts
vynn({ renderer: "new" })
```

The integrated renderer mode uses asynchronous tree preparation
followed by synchronous `render_new` serialization and document-root
hydration. The outer Vite response pipeline still streams the completed
document and injects CSS and client assets. This sandbox does not yet exercise
the native router, general async rendering resources, dynamic `<title>`
content, or the full legacy metadata runtime.
