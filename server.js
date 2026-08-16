// Servidor de "Pedidos del Puesto"
// Guarda todo en PostgreSQL (Neon, Render Postgres, o cualquier proveedor
// que te dé una cadena de conexión DATABASE_URL).

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable de entorno DATABASE_URL. Configúrala en Render (Environment) con la cadena de conexión de tu base de datos (por ejemplo, de Neon).');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------
// Inicialización de la base de datos (crea las tablas si no existen)
// ---------------------------------------------------------------------
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dias (
      label TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS vendedores (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS compradores (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY,
      dia TEXT NOT NULL,
      nombre TEXT NOT NULL,
      vendedor_id TEXT NOT NULL,
      vendedor_nombre TEXT NOT NULL,
      t_camaron INTEGER DEFAULT 0,
      t_marlin INTEGER DEFAULT 0,
      e_camaron INTEGER DEFAULT 0,
      e_marlin INTEGER DEFAULT 0,
      total NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS insumos (
      dia TEXT PRIMARY KEY,
      camaron NUMERIC DEFAULT 0,
      marlin NUMERIC DEFAULT 0,
      aceite NUMERIC DEFAULT 0,
      tortilla NUMERIC DEFAULT 0,
      verdura NUMERIC DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value JSONB
    );
  `);

  // Migración segura: agrega la columna es_vendedor si la tabla ya existía sin ella
  await pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS es_vendedor BOOLEAN DEFAULT false;`);
  await pool.query(`ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS pin_hash TEXT;`);
  await pool.query(`ALTER TABLE dias ADD COLUMN IF NOT EXISTS fecha DATE;`);

  const vendorCount = await pool.query('SELECT COUNT(*)::int AS c FROM vendedores');
  if (vendorCount.rows[0].c === 0) {
    await pool.query(
      "INSERT INTO vendedores (id, nombre) VALUES ('gaby','Gaby'), ('monica','Mónica')"
    );
  }

  const precios = await pool.query("SELECT 1 FROM config WHERE key='precios'");
  if (precios.rows.length === 0) {
    await pool.query("INSERT INTO config (key, value) VALUES ('precios', $1)", [
      JSON.stringify({ tacoCamaron: 20, tacoMarlin: 20, empCamaron: 30, empMarlin: 30 })
    ]);
  }
}

// ---------------------------------------------------------------------
// Autenticación de administrador (PIN con hash, verificado en servidor)
// ---------------------------------------------------------------------
async function requireAdmin(req, res, next) {
  try {
    const pin = req.headers['x-admin-pin'] || '';
    const r = await pool.query("SELECT value FROM config WHERE key='admin_pin'");
    if (r.rows.length === 0) return res.status(400).json({ error: 'no-pin-set' });
    const ok = await bcrypt.compare(pin, r.rows[0].value.hash);
    if (!ok) return res.status(401).json({ error: 'invalid-pin' });
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server-error' });
  }
}

app.get('/api/admin/status', async (req, res) => {
  const r = await pool.query("SELECT 1 FROM config WHERE key='admin_pin'");
  res.json({ pinSet: r.rows.length > 0 });
});

app.post('/api/admin/set-pin', async (req, res) => {
  const r = await pool.query("SELECT 1 FROM config WHERE key='admin_pin'");
  if (r.rows.length > 0) return res.status(400).json({ error: 'pin-already-set' });
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'missing-pin' });
  const hash = await bcrypt.hash(pin, 10);
  await pool.query("INSERT INTO config (key, value) VALUES ('admin_pin', $1)", [
    JSON.stringify({ hash })
  ]);
  res.json({ ok: true });
});

app.post('/api/admin/verify', async (req, res) => {
  const { pin } = req.body;
  const r = await pool.query("SELECT value FROM config WHERE key='admin_pin'");
  if (r.rows.length === 0) return res.status(400).json({ error: 'no-pin-set' });
  const ok = await bcrypt.compare(pin || '', r.rows[0].value.hash);
  res.json({ ok });
});

// ---------------------------------------------------------------------
// Días
// ---------------------------------------------------------------------
app.get('/api/dias', async (req, res) => {
  const r = await pool.query(
    "SELECT label, to_char(fecha,'YYYY-MM-DD') AS fecha FROM dias ORDER BY fecha DESC NULLS LAST, created_at DESC"
  );
  res.json(r.rows);
});

app.post('/api/dias', requireAdmin, async (req, res) => {
  const { label, fecha } = req.body;
  if (!label) return res.status(400).json({ error: 'missing-label' });
  await pool.query('INSERT INTO dias (label, fecha) VALUES ($1,$2) ON CONFLICT (label) DO NOTHING', [label, fecha || null]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------
app.get('/api/pedidos', async (req, res) => {
  const { dia } = req.query;
  const r = await pool.query('SELECT * FROM pedidos WHERE dia=$1 ORDER BY created_at DESC', [dia]);
  res.json(r.rows.map(rowToPedido));
});

app.post('/api/pedidos', async (req, res) => {
  const p = req.body;
  await pool.query(
    `INSERT INTO pedidos (id, dia, nombre, vendedor_id, vendedor_nombre, t_camaron, t_marlin, e_camaron, e_marlin, total, es_vendedor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [p.id, p.dia, p.nombre, p.vendedorId, p.vendedorNombre, p.tCamaron, p.tMarlin, p.eCamaron, p.eMarlin, p.total, !!p.esVendedor]
  );
  res.json({ ok: true });
});

app.put('/api/pedidos/:id', async (req, res) => {
  const p = req.body;
  await pool.query(
    `UPDATE pedidos SET nombre=$1, vendedor_id=$2, vendedor_nombre=$3, t_camaron=$4, t_marlin=$5, e_camaron=$6, e_marlin=$7, total=$8, es_vendedor=$9
     WHERE id=$10`,
    [p.nombre, p.vendedorId, p.vendedorNombre, p.tCamaron, p.tMarlin, p.eCamaron, p.eMarlin, p.total, !!p.esVendedor, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/pedidos/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM pedidos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

function rowToPedido(r) {
  return {
    id: r.id,
    dia: r.dia,
    nombre: r.nombre,
    vendedorId: r.vendedor_id,
    vendedorNombre: r.vendedor_nombre,
    tCamaron: r.t_camaron,
    tMarlin: r.t_marlin,
    eCamaron: r.e_camaron,
    eMarlin: r.e_marlin,
    total: Number(r.total),
    esVendedor: !!r.es_vendedor
  };
}

// ---------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------
app.get('/api/precios', async (req, res) => {
  const r = await pool.query("SELECT value FROM config WHERE key='precios'");
  res.json(r.rows[0] ? r.rows[0].value : {});
});

app.put('/api/precios', requireAdmin, async (req, res) => {
  await pool.query(
    "INSERT INTO config (key, value) VALUES ('precios', $1) ON CONFLICT (key) DO UPDATE SET value=$1",
    [JSON.stringify(req.body)]
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Insumos (inversión por día)
// ---------------------------------------------------------------------
app.get('/api/insumos', async (req, res) => {
  const { dia } = req.query;
  const r = await pool.query('SELECT * FROM insumos WHERE dia=$1', [dia]);
  res.json(r.rows[0] || { camaron: 0, marlin: 0, aceite: 0, tortilla: 0, verdura: 0 });
});

app.put('/api/insumos', requireAdmin, async (req, res) => {
  const { dia, camaron, marlin, aceite, tortilla, verdura } = req.body;
  await pool.query(
    `INSERT INTO insumos (dia, camaron, marlin, aceite, tortilla, verdura)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (dia) DO UPDATE SET camaron=$2, marlin=$3, aceite=$4, tortilla=$5, verdura=$6`,
    [dia, camaron, marlin, aceite, tortilla, verdura]
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Vendedores
// ---------------------------------------------------------------------
app.get('/api/vendedores', async (req, res) => {
  const r = await pool.query('SELECT id, nombre, (pin_hash IS NOT NULL) AS pin_set FROM vendedores ORDER BY nombre');
  res.json(r.rows);
});

app.post('/api/vendedores', requireAdmin, async (req, res) => {
  const { id, nombre } = req.body;
  await pool.query('INSERT INTO vendedores (id, nombre) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING', [id, nombre]);
  res.json({ ok: true });
});

// Login de vendedor: si aún no tiene PIN, el primer PIN que mande lo crea.
app.post('/api/vendedores/:id/auth', async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'missing-pin' });
  const r = await pool.query('SELECT pin_hash FROM vendedores WHERE id=$1', [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'not-found' });
  if (!r.rows[0].pin_hash) {
    const hash = await bcrypt.hash(pin, 10);
    await pool.query('UPDATE vendedores SET pin_hash=$1 WHERE id=$2', [hash, req.params.id]);
    return res.json({ ok: true, created: true });
  }
  const ok = await bcrypt.compare(pin, r.rows[0].pin_hash);
  res.json({ ok });
});

// Solo el administrador puede borrar el PIN de un vendedor (por si lo olvida)
app.post('/api/vendedores/:id/reset-pin', requireAdmin, async (req, res) => {
  await pool.query('UPDATE vendedores SET pin_hash=NULL WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Compradores
// ---------------------------------------------------------------------
app.get('/api/compradores', async (req, res) => {
  const r = await pool.query('SELECT * FROM compradores ORDER BY nombre');
  res.json(r.rows);
});

app.post('/api/compradores', async (req, res) => {
  const { id, nombre } = req.body;
  await pool.query('INSERT INTO compradores (id, nombre) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING', [id, nombre]);
  res.json({ ok: true });
});

app.delete('/api/compradores/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM compradores WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log('Pedidos del Puesto corriendo en el puerto ' + PORT));
  })
  .catch(err => {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  });
