import { DsqlSigner } from "@aws-sdk/dsql-signer";
import pg from "pg";

// numeric ve bigint değerleri JS sayısı olarak döner (para kuruş tamsayıdır, 2^53 altında).
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => Number(v));

export interface ConnectOptions {
  endpoint?: string; // <id>.dsql.<region>.on.aws
  region?: string;
  /** "admin" ise admin token; aksi halde DbConnect token (özel veritabanı rolü). */
  user?: string;
  max?: number;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;

/** Her yeni bağlantıda taze IAM token üretir; parola yok. */
export function createPool(opts: ConnectOptions = {}): pg.Pool {
  const endpoint = opts.endpoint ?? process.env.DSQL_ENDPOINT;
  if (!endpoint) throw new Error("DSQL_ENDPOINT tanımlı değil");
  const region = opts.region ?? process.env.AWS_REGION ?? "us-east-1";
  const user = opts.user ?? process.env.DSQL_USER ?? "admin";
  const signer = new DsqlSigner({ hostname: endpoint, region });

  let cached: { token: string; at: number } | undefined;
  const getToken = async () => {
    if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token;
    const token = user === "admin" ? await signer.getDbConnectAdminAuthToken() : await signer.getDbConnectAuthToken();
    cached = { token, at: Date.now() };
    return token;
  };

  return new pg.Pool({
    host: endpoint,
    port: 5432,
    user,
    database: "postgres",
    password: getToken as unknown as () => Promise<string>,
    ssl: { rejectUnauthorized: true },
    max: opts.max ?? 4,
    // Hazır (provisioned) kopyalarda bağlantı uzun süre boşta kalır; her istekte yeniden IAM token + TLS kurmamak için 15 dk.
    idleTimeoutMillis: 15 * 60_000,
    // DSQL bağlantı ömrü sınırlı; havuz bağlantıyı yeniler.
    maxLifetimeSeconds: 55 * 60,
  });
}

let shared: pg.Pool | undefined;
export const getPool = (): pg.Pool => (shared ??= createPool());
export const closePool = async (): Promise<void> => {
  if (shared) await shared.end();
  shared = undefined;
};
