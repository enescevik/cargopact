import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Şemalara .openapi() meta verisi eklenebilmesi için bir kez, şemalar oluşturulmadan önce çağrılır.
extendZodWithOpenApi(z);
export { z };
