const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { categories, products } = require('./seed');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zonorox123';
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// ---------- tiny JSON database ----------
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify({ categories, products, orders: [], nextOrder: 1001 }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
let db = loadDB();
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- public API ----------
app.get('/api/categories', (req, res) => {
  const counts = {};
  db.products.forEach(p => (counts[p.category] = (counts[p.category] || 0) + 1));
  res.json(db.categories.map(c => ({ ...c, count: counts[c.slug] || 0 })));
});

app.get('/api/products', (req, res) => {
  let { category, q, sort, trending, featured, min, max, page = 1, limit = 12, source } = req.query;
  let list = db.products.slice();
  if (category) list = list.filter(p => p.category === category);
  if (trending === '1') list = list.filter(p => p.trending);
  if (featured === '1') list = list.filter(p => p.featured);
  if (source) list = list.filter(p => p.source.toLowerCase() === String(source).toLowerCase());
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter(p => (p.name + ' ' + p.description + ' ' + p.category + ' ' + p.tags.join(' ')).toLowerCase().includes(s));
  }
  if (min) list = list.filter(p => p.price >= +min);
  if (max) list = list.filter(p => p.price <= +max);
  const sorters = {
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating,
    popular: (a, b) => b.reviews - a.reviews,
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  };
  if (sorters[sort]) list.sort(sorters[sort]);
  const total = list.length;
  page = Math.max(1, +page); limit = Math.min(60, Math.max(1, +limit));
  res.json({ total, page, pages: Math.ceil(total / limit), items: list.slice((page - 1) * limit, page * limit) });
});

app.get('/api/products/:slug', (req, res) => {
  const p = db.products.find(x => x.slug === req.params.slug || String(x.id) === req.params.slug);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const related = db.products.filter(x => x.category === p.category && x.id !== p.id).slice(0, 4);
  res.json({ product: p, related });
});

// Checkout: prices and stock are re-validated on the server
app.post('/api/orders', (req, res) => {
  const { customer = {}, items = [], payment = 'COD' } = req.body || {};
  const need = ['name', 'phone', 'address', 'city'];
  for (const f of need) if (!String(customer[f] || '').trim()) return res.status(400).json({ error: `Please enter ${f}` });
  if (!/^[0-9+\-\s]{10,15}$/.test(customer.phone)) return res.status(400).json({ error: 'Invalid phone number' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Cart is empty' });

  const lines = [];
  for (const it of items) {
    const p = db.products.find(x => x.id === +it.id);
    const qty = Math.max(1, Math.min(20, +it.qty || 1));
    if (!p) return res.status(400).json({ error: 'A product in your cart no longer exists' });
    if (p.stock < qty) return res.status(400).json({ error: `Only ${p.stock} left of ${p.name}` });
    lines.push({ id: p.id, name: p.name, price: p.price, qty, image: p.images[0] });
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const shipping = subtotal >= 5000 ? 0 : 250;
  const order = {
    id: db.nextOrder++,
    customer: { name: customer.name.trim(), phone: customer.phone.trim(), email: (customer.email || '').trim(), address: customer.address.trim(), city: customer.city.trim() },
    items: lines, subtotal, shipping, total: subtotal + shipping,
    payment: ['COD', 'Bank Transfer', 'JazzCash', 'Easypaisa'].includes(payment) ? payment : 'COD',
    status: 'Pending', createdAt: new Date().toISOString(),
  };
  lines.forEach(l => { db.products.find(x => x.id === l.id).stock -= l.qty; });
  db.orders.unshift(order);
  save();
  res.status(201).json(order);
});

app.get('/api/orders/track/:id', (req, res) => {
  const o = db.orders.find(x => String(x.id) === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json({ id: o.id, status: o.status, total: o.total, createdAt: o.createdAt, items: o.items.map(i => ({ name: i.name, qty: i.qty })) });
});

// ---------- admin API ----------
const sessions = new Set();
const auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!sessions.has(t)) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

app.post('/api/admin/login', (req, res) => {
  const a = Buffer.from(String(req.body.password || ''));
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Wrong password' });
  const token = crypto.randomBytes(24).toString('hex');
  sessions.add(token);
  res.json({ token });
});

app.get('/api/admin/stats', auth, (req, res) => {
  res.json({
    products: db.products.length,
    orders: db.orders.length,
    revenue: db.orders.filter(o => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0),
    pending: db.orders.filter(o => o.status === 'Pending').length,
    lowStock: db.products.filter(p => p.stock <= 5).map(p => ({ id: p.id, name: p.name, stock: p.stock })),
  });
});

const clean = b => {
  const out = {
    name: String(b.name || '').trim(),
    category: b.category,
    price: +b.price,
    oldPrice: +b.oldPrice || 0,
    description: String(b.description || ''),
    stock: Math.max(0, parseInt(b.stock) || 0),
    images: (Array.isArray(b.images) ? b.images : String(b.images || '').split('\n')).map(s => s.trim()).filter(Boolean),
    trending: !!b.trending, featured: !!b.featured, source: b.source || '',
    tags: (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map(s => s.trim()).filter(Boolean),
  };
  return out;
};
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

app.post('/api/admin/products', auth, (req, res) => {
  const d = clean(req.body);
  if (!d.name || !(d.price > 0) || !db.categories.some(c => c.slug === d.category)) return res.status(400).json({ error: 'Name, valid price and category are required' });
  if (!d.images.length) d.images = ['/img/photo-1523275335684-37898b6baf30.jpg'];
  let slug = slugify(d.name);
  if (db.products.some(p => p.slug === slug)) slug += '-' + Date.now() % 10000;
  const p = { id: Math.max(0, ...db.products.map(x => x.id)) + 1, slug, rating: 4.5, reviews: 0, createdAt: new Date().toISOString(), ...d };
  db.products.unshift(p); save(); res.status(201).json(p);
});

app.put('/api/admin/products/:id', auth, (req, res) => {
  const p = db.products.find(x => x.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const d = clean({ ...p, ...req.body });
  if (!d.name || !(d.price > 0)) return res.status(400).json({ error: 'Invalid data' });
  Object.assign(p, d); save(); res.json(p);
});

app.delete('/api/admin/products/:id', auth, (req, res) => {
  const i = db.products.findIndex(x => x.id === +req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  db.products.splice(i, 1); save(); res.json({ ok: true });
});

app.get('/api/admin/orders', auth, (req, res) => res.json(db.orders));

app.put('/api/admin/orders/:id', auth, (req, res) => {
  const o = db.orders.find(x => String(x.id) === req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const allowed = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  if (req.body.status === 'Cancelled' && o.status !== 'Cancelled') o.items.forEach(l => { const p = db.products.find(x => x.id === l.id); if (p) p.stock += l.qty; });
  o.status = req.body.status; save(); res.json(o);
});

// pretty URLs fall back to the SPA
app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Zonorox running on http://localhost:${PORT}  (admin: /admin, password: ${ADMIN_PASSWORD})`));
