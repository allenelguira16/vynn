import { transform } from "@babel/core";
// @ts-expect-error - not typed
import babelPluginTS from "@babel/preset-typescript";
import babelPluginVynn from "@babel/preset-vynn";
import { PluginOption } from "vite";

type VitePluginVynnOptions = {
  ssr: boolean;
};

/**
 * vite plugin for vynn
 *
 * @returns The vite plugin.
 */
export default (options: VitePluginVynnOptions = { ssr: false }) => {
  return [
    {
      name: "vite-plugin-vynn",
      enforce: "pre",

      transform(code, id) {
        const [filename] = id.split("?", 2);

        if (/\.(t|j)sx($|\?)/.test(filename)) {
          const result = transform(code, {
            filename,
            sourceMaps: true,
            presets: [[babelPluginVynn, options], babelPluginTS],
            generatorOpts: {
              comments: true,
              shouldPrintComment: (val) => /#__PURE__/.test(val),
            },
          });

          if (result?.code) {
            return {
              code: result.code,
              map: result.map,
            };
          }
        }
      },
    },
    // pluginSsrDevFoucFix(),
  ] satisfies PluginOption;
};

// function pluginSsrDevFoucFix(): Plugin {
//   const virtualCssPath = "/@virtual:ssr-css.css";
//   // keep styles map scoped to the plugin instance
//   const collectedStyles = new Map<string, string>();

//   return {
//     name: "ssr-dev-FOUC-fix",
//     // ✅ tell Vite this plugin is only for the dev server ('vite serve')
//     apply: "serve",

//     // gather CSS module contents as they are transformed
//     transform(code: string, id: string) {
//       if (id.includes("node_modules")) return null;
//       if (/\.css(\?|$)/.test(id)) {
//         collectedStyles.set(id, code);
//       }
//       return null;
//     },

//     // update collected CSS on HMR (optional but handy)
//     handleHotUpdate(ctx) {
//       const { file, read } = ctx;
//       if (/\.css(\?|$)/.test(file)) {
//         Promise.resolve(read()).then((code) => {
//           // ✅ always a Promise
//           collectedStyles.set(file, code);
//         });
//       }
//     },

//     // serve a virtual stylesheet that concatenates everything we've collected
//     configureServer(server: ViteDevServer) {
//       server.middlewares.use((req, res, next) => {
//         if (req.url === virtualCssPath) {
//           res.setHeader("Content-Type", "text/css");
//           res.statusCode = 200;
//           res.end(Array.from(collectedStyles.values()).join("\n"));
//           return;
//         }
//         next();
//       });

//       // small debug so you can confirm the plugin is active
//       // remove or wrap in env guard if you don't want logspam

//       console.log("[ssr-dev-FOUC-fix] plugin active (dev server)");
//     },

//     // inject a single <link> pointing at the virtual stylesheet into the head
//     transformIndexHtml: {
//       enforce: "pre",
//       handler: () => [
//         {
//           tag: "link",
//           injectTo: "head",
//           attrs: { rel: "stylesheet", href: virtualCssPath },
//         },
//       ],
//     },
//   };
// }
