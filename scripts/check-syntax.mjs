import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDirs = ["src"];
const extraFiles = ["public/app.js"];

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectJsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFile(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Syntax check failed: ${file}`));
    });
    child.on("error", reject);
  });
}

const files = [];
for (const dir of rootDirs) {
  files.push(...await collectJsFiles(dir));
}
for (const file of extraFiles) {
  files.push(file);
}

for (const file of files) {
  await checkFile(file);
}

console.log(`✅ Syntax check passed for ${files.length} JavaScript files.`);
