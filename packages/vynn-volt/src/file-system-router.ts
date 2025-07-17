import fs from "node:fs";

import path from "path";
import { AppOptions, RouterSchemaInput } from "vinxi";
import { BaseFileSystemRouter, cleanPath } from "vinxi/fs-router";

/**
 * @vynn/volt file system router helper for vinxi
 */
class VynnFileSystemRouter extends BaseFileSystemRouter {
  toPath(filePath: string) {
    // only treat "page.tsx/ts/jsx/js" as routes
    if (!/page\.(t|j)sx?$/.test(path.basename(filePath))) {
      return "";
    }

    const routePath = cleanPath(filePath, this.config)
      .replace(/\/page$/, "") // remove trailing /page
      .replace(/\[([^/]+)\]/g, (_, m) => {
        if (m.startsWith("...")) return `*${m.slice(3)}`;
        return `:${m}`;
      });

    return routePath?.length > 0 ? `${routePath}` : "/";
  }

  toRoute(filePath: string) {
    const routePath = this.toPath(filePath);
    if (!routePath) return null; // skip non-page files

    const dir = path.dirname(filePath);
    const layoutFilePath = path.join(dir, "layout.tsx");

    return {
      $$component: {
        src: filePath,
        pick: ["default"],
      },
      ...(fs.existsSync(layoutFilePath)
        ? {
            $$layout: {
              src: layoutFilePath,
              pick: ["default"],
            },
          }
        : {}),
      path: routePath,
      filePath,
    };
  }
}

type RouterOptions = {
  dir: string;
};

export function fileSystemRouter({ dir }: RouterOptions) {
  return (router: RouterSchemaInput, app: AppOptions) => {
    return new VynnFileSystemRouter(
      {
        dir,
        extensions: ["tsx", "ts", "jsx", "js"],
      },
      router,
      app,
    );
  };
}
