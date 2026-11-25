import { getPool } from "@cargopact/db";
import { flushAll } from "./lib/events";

/** EventBridge Scheduler/Rule (rate 1 dakika) tetikler: yeni denetim kayıtlarını olay veri yoluna yayınlar. */
export const handler = async () => {
  const results = await flushAll(getPool());
  console.log(JSON.stringify({ level: "info", worker: "integrations", results }));
  return { results };
};
