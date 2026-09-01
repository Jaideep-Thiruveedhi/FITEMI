import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIT_LOG_PATH = path.join(__dirname, "../../data/audit.log");

export function appendAuditLog(entry) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  }) + "\n";
  fs.appendFileSync(AUDIT_LOG_PATH, line, "utf-8");
}

export function readAuditLog() {
  if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
  const content = fs.readFileSync(AUDIT_LOG_PATH, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
}

export { AUDIT_LOG_PATH };
