import { execSync } from "child_process";

const workspaces = ["@babel/preset-vynn", "vite-plugin-vynn", "vynn", "vynn-router", "@vynn/volt"];

for (const workspace of workspaces) {
  try {
    console.log(`removing build files for ${workspace}`);
    execSync(`yarn ${workspace} clean`, { stdio: "inherit" });
  } catch (error) {
    console.error(error);
    process.exit(1); // stop on failure
  }
}
