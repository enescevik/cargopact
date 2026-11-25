import type pg from "pg";
import { authenticate } from "./lib/auth";
import { HttpError, notFound, type Req, type Res } from "./lib/http";
import { coreRoutes, meHandler, platformRoutes } from "./routes/core";
import { masterDataRoutes, type Route } from "./routes/master-data";

const compile = (pattern: string) => {
  const names: string[] = [];
  const re = new RegExp("^" + pattern.replace(/\{(\w+)\}/g, (_m, n: string) => { names.push(n); return "([^/]+)"; }) + "/?$");
  return { re, names };
};

export function buildRouter(pool: pg.Pool) {
  const routes: Route[] = [...coreRoutes(pool), ...platformRoutes(pool), ...masterDataRoutes(pool)];
  const compiled = routes.map((r) => ({ ...r, ...compile(r.pattern) }));

  return async function route(req: Req): Promise<Res> {
    if (req.method === "GET" && req.path === "/me") return meHandler(pool, req);
    let pathMatched = false;
    for (const r of compiled) {
      const m = r.re.exec(req.path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;
      r.names.forEach((n, i) => { req.params[n] = decodeURIComponent(m[i + 1]); });
      if (r.pattern === "/health") return r.handler(undefined as never, req);
      const ctx = await authenticate(pool, req);
      return r.handler(ctx, req);
    }
    if (pathMatched) throw new HttpError("NOT_FOUND", "Bu yol için yöntem desteklenmiyor.");
    throw notFound("Uç nokta");
  };
}
