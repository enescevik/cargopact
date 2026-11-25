import { writeFileSync } from "node:fs";
import { buildOpenApiDocument } from "../src/openapi";

const doc = buildOpenApiDocument(process.env.API_URL);
writeFileSync(new URL("../openapi.json", import.meta.url), JSON.stringify(doc, null, 2) + "\n");
console.log(`openapi.json yazıldı: ${Object.keys(doc.paths ?? {}).length} yol`);
