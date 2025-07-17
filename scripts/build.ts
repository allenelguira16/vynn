import { execSync } from "child_process";

const workspaces = ["@babel/preset-vynn", "vite-plugin-vynn", "vynn", "vynn-router", "@vynn/volt"];

console.clear();
for (const workspace of workspaces) {
  try {
    console.log(`Building for ${workspace}`);
    execSync(`yarn workspace ${workspace} build`, { stdio: "inherit" });
  } catch (error) {
    console.error(error);
    process.exit(1); // stop on failure
  }
}

console.log("Done building packages");
