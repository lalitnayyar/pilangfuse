import "dotenv/config";
import { runResearch } from "./workflow/runResearch.js";

const topic = process.argv.slice(2).join(" ").trim();

if (!topic) {
  console.error('Usage: npm run research -- "your topic"');
  process.exit(1);
}

try {
  const result = await runResearch({ topic });
  console.log(`\n📄 Report created: ${result.report.filePath}`);
} catch (error) {
  console.error(`\n❌ ${error.message}`);
  process.exitCode = 1;
}
