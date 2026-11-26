# render_new browser sandbox

This is a standalone Vite app for the experimental renderer. It intentionally
does not use the integrated vynn() application plugin, the legacy JSX
transform, the file router, or legacy SSR.

From the repository root:

```sh
pnpm install
pnpm --filter render-new-app dev
```

Open http://localhost:3001.

The Vite config installs only vynnRenderNewOxcPlugin(). The browser entry
calls mountRenderNew(root, App()) directly. The page includes a reactive
counter and a keyed list so DOM identity can be inspected while rows are
reordered, added, and removed.

This sandbox is client-rendered. It is a working surface for the standalone
renderer, not yet the integrated Vynn app or its SSR/document pipeline.
