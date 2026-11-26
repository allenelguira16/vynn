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

The app returns a complete `<html>` document from `src/App.tsx`. Vynn generates
the browser entry, mounts the new renderer against `document`, and replaces
the starter document shell. The playground includes a reactive counter and a
keyed list so DOM identity can be inspected while rows are reordered, added,
and removed.

The Vite config uses:

```ts
vynn({ renderer: "new" })
```

The integrated renderer mode currently supports document-root client rendering
and the synchronous `render_new` SSR serializer. It does not yet support the
legacy file-router `Router` component, async/streaming resources, dynamic
`<title>` content, or the full legacy metadata runtime.
