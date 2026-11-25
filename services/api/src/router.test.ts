import { describe, expect, it } from "vitest";
import { API_OPERATIONS } from "@cargopact/contracts";
import { ROUTE_TABLE } from "./router";

describe("sözleşme: yönlendirici = OpenAPI", () => {
  it("her rota belgede, her belge yolu yönlendiricide", () => {
    const impl = ROUTE_TABLE({} as never).map((r) => `${r.method} ${r.pattern}`).sort();
    const spec = API_OPERATIONS.map((o) => `${o.method} ${o.path}`).sort();
    expect(impl).toEqual(spec);
  });
});
