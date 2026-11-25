import type pg from "pg";

export class ConflictError extends Error {
  readonly code = "CONFLICT";
  constructor(message = "İşlem eşzamanlı bir değişiklikle çakıştı, lütfen tekrar deneyin.") {
    super(message);
  }
}

/** OCC çakışması (serialization failure) ve geçici bağlantı hataları yeniden denenir. */
export const isRetryable = (e: unknown): boolean => {
  const code = (e as { code?: string })?.code;
  return code === "40001" || code === "40P01" || code === "08006" || code === "08003" || code === "57P01";
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TxOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Bir işlem içinde fn çalıştırır; `40001` gibi geçici hatalarda üstel + jitter geri çekilmeyle yeniden dener.
 * fn yeniden çalışabilir olmalıdır: işlem içinde dış (yan etkili) çağrı yapmayın.
 */
export async function withTx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  const base = opts.baseDelayMs ?? 25;
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const out = await fn(client);
      await client.query("commit");
      return out;
    } catch (e) {
      await client.query("rollback").catch(() => undefined);
      if (isRetryable(e)) {
        if (attempt >= maxRetries) throw new ConflictError();
        await sleep(Math.random() * base * 2 ** attempt);
        continue;
      }
      throw e;
    } finally {
      client.release();
    }
  }
}

/** Bir işlemde en çok 3000 satır yazılabilir (DSQL sınırı). */
export const MAX_ROWS_PER_TX = 3000;
export function chunk<T>(rows: T[], size = MAX_ROWS_PER_TX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
