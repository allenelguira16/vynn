import { CodeBlock } from "../components/CodeBlock";

export const InstallationPage = () => {
  return (
    <div>
      <h1>Installation</h1>
      <section>
        <p>
          Currently there's no npm package for it since this is just a hobby project but still you
          can install it via git
        </p>
        <p>
          But first you must use yarn berry for it to work (sorry npm users this is yarn exclusive)
        </p>
      </section>
      <section>
        <h2>Setup environment</h2>
        <section>
          <p>First install yarn if you don't have it</p>
          <CodeBlock lang="bash" code={`npm i -g yarn`} />
        </section>
        <section>
          <p>Then install version to berry (yarn 2+)</p>
          <CodeBlock lang="bash" code={`yarn set version berry`} />
        </section>
        <section>
          <p>Add node_modules as nodeLinker</p>
          <CodeBlock
            lang="bash"
            code={`
            yarnPath: .yarn/releases/yarn-4.9.2.cjs

            nodeLinker: node-modules # add this line
          `}
          />
        </section>
      </section>
      <section>
        <h2>Installing vynn</h2>
        <CodeBlock
          lang="bash"
          code={`yarn add "vynn@git+https://github.com/allenelguira16/vynn.git#workspace=vynn"`}
        />
        <p>tsconfig.json (important)</p>
        <p>
          Also in your editor, it will show an error that JSX runtime is missing since by default
          tsconfig will search for React JSX runtime For that to work, you must add the following
          config in tsconfig.json so it will use the vynn JSX runtime
        </p>
        <CodeBlock
          lang="json5"
          code={`
            {
              "compilerOptions": {
                // add the following...
                "jsx": "preserve",
                "jsxImportSource": "vynn"
              }
            }
          `}
        />
      </section>
      <section>
        <h2>Installing vite plugin</h2>
        <CodeBlock
          lang="json5"
          code={`yarn add "vite-plugin-vynn@git+https://github.com/allenelguira16/vynn.git#workspace=vite-plugin-vynn"`}
        />
        <p>And in your vite config add it to the plugin</p>
        <CodeBlock
          lang="tsx"
          code={`
            import { defineConfig } from "vite";
            import vynn from "vite-plugin-vynn";

            export default defineConfig({
              plugins: [vynn()],
            });
          `}
        />
        <section>
          <p>Installing babel preset</p>
          <CodeBlock
            lang="bash"
            code={`
              yarn add "@babel/preset-vynn@git+https://github.com/allenelguira16/vynn.git#workspace=@babel/preset-vynn"
            `}
          />
          <p>Then add it as plugin in your babel config</p>
          <CodeBlock
            lang="json5"
            code={`
              {
                "presets": ["@babel/preset-vynn"]
              }
            `}
          />
        </section>
        <section>
          <h2>Example</h2>
          <CodeBlock
            lang="tsx"
            code={`
              import { createRoot } from "vynn";

              function App() {
                return (
                  <div>
                    <h1>Hello World!</h1>
                  </div>
                );
              }

              createApp(App).mount("#app");
          `}
          />
        </section>
      </section>
    </div>
  );
};
