import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function writeBackupBytesSync(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: "wx" });
}

export function copyBackupFileSync(source, target, expectedSha256 = null) {
  const bytes = fs.readFileSync(source);
  if (expectedSha256 && sha256(bytes) !== expectedSha256) {
    throw new Error(`backup source changed before capture: ${source}`);
  }
  writeBackupBytesSync(target, bytes);
}

export function createDirectoryLinkSync(source, target) {
  fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
}
