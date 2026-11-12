import pg from "pg";

let pool;

function getUrl() {
  let url = process.env.MASTER_DB_URL || "";
  if (url.startsWith("=postgres")) url = url.slice(1);
  return url.trim();
}

export function hasMasterDb() {
  return Boolean(getUrl());
}

function getPool() {
  if (pool) return pool;
  const connectionString = getUrl();
  if (!connectionString) throw new Error("MASTER_DB_URL not set");
  pool = new pg.Pool({
    connectionString,
    // Works with Prisma pooled endpoints and typical hosted Postgres.
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[masterdb] pool error:", err.message));
  return pool;
}

export async function listNiches() {
  if (!hasMasterDb()) return [];
  const { rows } = await getPool().query(
    `SELECT id, name, slug, active, "sortOrder"
       FROM niches
      WHERE active = true
      ORDER BY "sortOrder" ASC, name ASC, id ASC`
  );
  return rows;
}

export async function getNiche(id) {
  if (!hasMasterDb() || !id) return null;
  const { rows } = await getPool().query(
    `SELECT id, name, slug, active, "sortOrder"
       FROM niches WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Pick the next active product for a niche in a stable cycle (1,2,3,1,...).
 * Ordering: sortOrder, createdAt, id. If lastProductId is missing or not
 * found, returns the first product. Returns null when the niche has no
 * active products.
 */
export async function nextProductForNiche(nicheId, lastProductId) {
  if (!hasMasterDb() || !nicheId) return null;
  const { rows: products } = await getPool().query(
    `SELECT *
       FROM products
      WHERE "nicheId" = $1 AND active = true
      ORDER BY "sortOrder" ASC, "createdAt" ASC, id ASC`,
    [nicheId]
  );
  if (!products.length) return null;
  if (!lastProductId) return products[0];
  const idx = products.findIndex((p) => p.id === lastProductId);
  if (idx === -1) return products[0];
  return products[(idx + 1) % products.length];
}

export async function getProduct(id) {
  if (!hasMasterDb() || !id) return null;
  const { rows } = await getPool().query(
    `SELECT *
       FROM products WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}
