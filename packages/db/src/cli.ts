import { createPool } from "./connection";
import { grantAppRole, migrate } from "./migrate";
import { ensureCognitoUsers } from "./seed/cognito";
import { resetDemo, seedL1, seedUserRows, verifySeed } from "./seed/seed";

const cmd = process.argv[2];
const pool = createPool({ user: "admin", max: 2 });
const need = (name: string) => { const v = process.env[name]; if (!v) throw new Error(`${name} gerekli`); return v; };

try {
  switch (cmd) {
    case "migrate": {
      const r = await migrate(pool);
      console.log(`Uygulanan: ${r.applied.length}, atlanan: ${r.skipped.length}`);
      break;
    }
    case "grant":
      await grantAppRole(pool, need("APP_ROLE_ARN"));
      break;
    case "seed":
      await seedL1(pool);
      break;
    case "seed-users": {
      const subs = await ensureCognitoUsers(need("USER_POOL_ID"), need("SEED_USER_PASSWORD"));
      await seedUserRows(pool, subs);
      break;
    }
    case "seed-verify": {
      const r = await verifySeed(pool);
      for (const c of r.checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name} (${c.detail})`);
      if (!r.ok) process.exitCode = 1;
      break;
    }
    case "seed-reset":
      await resetDemo(pool);
      break;
    default:
      throw new Error(`Bilinmeyen komut: ${cmd}`);
  }
} finally {
  await pool.end();
}
