import { randomBytes } from "node:crypto";
console.log(`APP_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`BOOTSTRAP_CODE=${randomBytes(12).toString("hex").toUpperCase()}`);
