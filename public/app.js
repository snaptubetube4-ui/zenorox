const $ = s => document.querySelector(s);
const app = $('#app');
const rs = n => 'Rs. ' + Number(n).toLocaleString('en-PK');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800'><rect width='100%' height='100%' fill='%23eef1f6'/><text x='50%' y='50%' font-family='sans-serif' font-size='42' fill='%2399a2b5' text-anchor='middle'>Zenorox</text></svg>";
const imgTag = (src, alt, extra = '') => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${FALLBACK}'" ${extra}>`;
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
};

let cats = [];
let cart = JSON.parse(localStorage.getItem('zx_cart') || '[]'); // [{id,name,price,image,qty,stock,slug}]
const saveCart = () => { localStorage.setItem('zx_cart', JSON.stringify(cart)); renderCart(); };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------- cart ---------- */
function addToCart(p, qty = 1, open = false) {
  const line = cart.find(l => l.id === p.id);
  const have = line ? line.qty : 0;
  if (have + qty > p.stock) return toast(p.stock ? `Only ${p.stock} in stock` : 'Out of stock');
  if (line) line.qty += qty;
  else cart.push({ id: p.id, slug: p.slug, name: p.name, price: p.price, image: p.images[0], qty, stock: p.stock });
  saveCart(); toast('Added to cart'); if (open) openCart();
}
const totals = () => {
  const sub = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const ship = !sub || sub >= 5000 ? 0 : 250;
  return { sub, ship, total: sub + ship };
};
function renderCart() {
  $('#cartCount').textContent = cart.reduce((s, l) => s + l.qty, 0);
  const body = $('#drawerBody'), foot = $('#drawerFoot');
  if (!cart.length) {
    body.innerHTML = '<div class="empty">Your cart is empty.<br><br><a class="btn" href="#/shop" data-close>Start shopping</a></div>';
    foot.innerHTML = ''; return;
  }
  const t = totals();
  const left = Math.max(0, 5000 - t.sub);
  body.innerHTML = `<div class="freebar">${left ? `Add ${rs(left)} more for free delivery` : 'You get free delivery'}<i><u style="width:${Math.min(100, t.sub / 50)}%"></u></i></div>` +
    cart.map(l => `<div class="line">${imgTag(l.image, l.name)}<div><h4>${esc(l.name)}</h4><div>${rs(l.price)}</div>
      <div class="qty"><button data-dec="${l.id}" aria-label="Decrease">&minus;</button><span>${l.qty}</span><button data-inc="${l.id}" aria-label="Increase">+</button></div></div>
      <button class="rm" data-rm="${l.id}">Remove</button></div>`).join('');
  foot.innerHTML = `<div class="sum"><span>Subtotal</span><span>${rs(t.sub)}</span></div>
    <div class="sum"><span>Delivery</span><span>${t.ship ? rs(t.ship) : 'Free'}</span></div>
    <div class="sum total"><span>Total</span><span>${rs(t.total)}</span></div>
    <a class="btn full" href="#/checkout" data-close>Checkout</a>`;
}
function openCart() { $('#drawer').classList.add('on'); $('#overlay').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false'); }
function closeCart() { $('#drawer').classList.remove('on'); $('#overlay').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); }

document.addEventListener('click', e => {
  const t = e.target.closest('button,a'); if (!t) return;
  const d = t.dataset;
  if (d.close !== undefined) closeCart();
  if (d.inc) { const l = cart.find(x => x.id == d.inc); if (l.qty < l.stock) l.qty++; else toast('No more stock available'); saveCart(); }
  if (d.dec) { const l = cart.find(x => x.id == d.dec); l.qty--; if (l.qty < 1) cart = cart.filter(x => x !== l); saveCart(); }
  if (d.rm) { cart = cart.filter(x => x.id != d.rm); saveCart(); }
  if (d.add) { api('/api/products/' + d.add).then(r => addToCart(r.product, 1, true)).catch(err => toast(err.message)); }
});
$('#cartBtn').onclick = openCart;
$('#closeCart').onclick = closeCart;
$('#overlay').onclick = closeCart;
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
$('#searchForm').onsubmit = e => { e.preventDefault(); const q = $('#searchInput').value.trim(); if (q) location.hash = '#/shop?q=' + encodeURIComponent(q); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

/* ---------- components ---------- */
const stars = (r, n) => `<div class="stars">${'&#9733;'.repeat(Math.round(r))}${'&#9734;'.repeat(5 - Math.round(r))}<span>${r.toFixed(1)} (${n})</span></div>`;
function card(p) {
  const off = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const cat = cats.find(c => c.slug === p.category);
  return `<article class="card"><a href="#/product/${esc(p.slug)}" class="card-img">${imgTag(p.images[0], p.name)}
    <div class="badges">${off ? `<span class="badge">-${off}%</span>` : ''}${p.trending ? `<span class="badge hot">Trending${p.source ? ' on ' + esc(p.source) : ''}</span>` : ''}${p.stock < 1 ? '<span class="badge out">Sold out</span>' : ''}</div></a>
    <div class="card-body"><span class="card-cat">${esc(cat ? cat.name : p.category)}</span>
    <h3><a href="#/product/${esc(p.slug)}">${esc(p.name)}</a></h3>${stars(p.rating, p.reviews)}
    <div class="price"><b>${rs(p.price)}</b>${p.oldPrice > p.price ? `<s>${rs(p.oldPrice)}</s>` : ''}</div>
    <button class="add" data-add="${p.id}" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Sold out' : 'Add to cart'}</button></div></article>`;
}
const skeletons = n => `<div class="grid">${'<div class="skeleton"></div>'.repeat(n)}</div>`;

/* ---------- pages ---------- */
async function home() {
  app.innerHTML = skeletons(4);
  const [feat, trend, newest] = await Promise.all([
    api('/api/products?featured=1&limit=4'), api('/api/products?trending=1&sort=popular&limit=8'), api('/api/products?sort=newest&limit=4')]);
  const heroImgs = feat.items.slice(0, 4).map(p =>
    `<a class="hero-shot" href="#/product/${esc(p.slug)}">${imgTag(p.images[0], p.name)}<span>${esc(p.name)}</span></a>`
  ).join('');
  app.innerHTML = `
  <section class="hero"><div class="hero-copy"><span class="hero-tag">New season, new prices</span>
    <h1>Everything trending in Pakistan, in one store.</h1>
    <p>Shoes, watches, frames, laptop stands and the gadgets everyone is ordering on Daraz and Alibaba right now. Pay on delivery.</p>
    <div class="hero-actions"><a class="btn light" href="#/shop?trending=1">Shop trending</a><a class="btn ghost" href="#/shop">Browse all</a></div></div>
    <div class="hero-imgs">${heroImgs}</div></section>
  <div class="perks"><div class="perk"><b>Free delivery</b><span>On orders above Rs. 5,000</span></div><div class="perk"><b>Cash on delivery</b><span>Check it, then pay</span></div>
    <div class="perk"><b>7-day returns</b><span>Wrong or damaged item? We swap it</span></div><div class="perk"><b>Trending picks</b><span>Chosen from Daraz and Alibaba bestsellers</span></div></div>
  <section class="sec"><div class="sec-head"><h2>Shop by category</h2></div><div class="cats">${cats.map(c => `<a class="cat" href="#/shop?category=${c.slug}">${imgTag(c.image, c.name)}<div><h3>${esc(c.name)}</h3><small>${c.count} products</small></div></a>`).join('')}</div></section>
  <section class="sec"><div class="sec-head"><h2>Trending right now</h2><a href="#/shop?trending=1">View all</a></div><div class="grid">${trend.items.map(card).join('')}</div></section>
  <section class="banner"><h2>Upgrade your desk with laptop stands from Rs. 2,499</h2><a class="btn" href="#/shop?category=laptop-stands">Shop laptop stands</a></section>
  <section class="sec"><div class="sec-head"><h2>New arrivals</h2><a href="#/shop?sort=newest">View all</a></div><div class="grid">${newest.items.map(card).join('')}</div></section>`;
}

async function shop(params) {
  const q = Object.fromEntries(params);
  const page = +q.page || 1;
  app.innerHTML = skeletons(8);
  const qs = new URLSearchParams({ ...q, page, limit: 12 });
  const r = await api('/api/products?' + qs);
  const cat = cats.find(c => c.slug === q.category);
  const title = q.q ? `Results for "${esc(q.q)}"` : q.trending ? 'Trending now' : cat ? esc(cat.name) : 'All products';
  const link = (over) => '#/shop?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...q, ...over }).filter(([, v]) => v !== '' && v != null)));
  app.innerHTML = `<div class="crumbs"><a href="#/">Home</a> / ${title}</div>
  <div class="shop-top"><h1>${title} <small style="font-size:16px;color:var(--muted);font-weight:400">(${r.total})</small></h1>
    <div class="filters"><select id="sort" aria-label="Sort"><option value="">Sort: Featured</option>
      ${[['popular', 'Most popular'], ['newest', 'Newest'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['rating', 'Top rated']].map(([v, l]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input id="min" type="number" placeholder="Min Rs." value="${esc(q.min || '')}" style="width:110px" aria-label="Minimum price">
      <input id="max" type="number" placeholder="Max Rs." value="${esc(q.max || '')}" style="width:110px" aria-label="Maximum price"></div></div>
  <div class="chips"><a class="chip ${!q.category && !q.trending ? 'on' : ''}" href="#/shop">All</a><a class="chip ${q.trending ? 'on' : ''}" href="#/shop?trending=1">Trending</a>
    ${cats.map(c => `<a class="chip ${q.category === c.slug ? 'on' : ''}" href="#/shop?category=${c.slug}">${esc(c.name)}</a>`).join('')}</div>
  ${r.items.length ? `<div class="grid">${r.items.map(card).join('')}</div>` : '<div class="empty"><h3>No products found</h3><p>Try a different word or clear the filters.</p><br><a class="btn" href="#/shop">Show all products</a></div>'}
  ${r.pages > 1 ? `<div class="pager">${Array.from({ length: r.pages }, (_, i) => `<button class="${i + 1 === page ? 'on' : ''}" data-page="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}`;
  const apply = () => { location.hash = link({ sort: $('#sort').value, min: $('#min').value, max: $('#max').value, page: '' }); };
  $('#sort').onchange = apply; $('#min').onchange = apply; $('#max').onchange = apply;
  document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { location.hash = link({ page: b.dataset.page }); window.scrollTo(0, 0); });
}

async function product(slug) {
  app.innerHTML = skeletons(2);
  const { product: p, related } = await api('/api/products/' + slug);
  const cat = cats.find(c => c.slug === p.category);
  const off = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  document.title = p.name + ' | Zenorox';
  let qty = 1;
  app.innerHTML = `<div class="crumbs"><a href="#/">Home</a> / <a href="#/shop?category=${esc(p.category)}">${esc(cat ? cat.name : p.category)}</a> / ${esc(p.name)}</div>
  <div class="pdp"><div class="gallery"><div class="main" id="mainImg">${imgTag(p.images[0], p.name)}</div>
    <div class="thumbs">${p.images.map((s, i) => `<button class="${i ? '' : 'on'}" data-img="${esc(s)}" aria-label="Photo ${i + 1}">${imgTag(s, '')}</button>`).join('')}</div></div>
  <div><span class="card-cat">${esc(cat ? cat.name : '')}</span><h1>${esc(p.name)}</h1>${stars(p.rating, p.reviews)}
    <div class="price" style="margin-top:12px"><b>${rs(p.price)}</b>${off ? `<s>${rs(p.oldPrice)}</s><span class="badge">-${off}%</span>` : ''}</div>
    ${p.trending ? `<p style="margin-top:10px"><span class="badge hot">Trending${p.source ? ' on ' + esc(p.source) : ''}</span></p>` : ''}
    <p class="desc">${esc(p.description)}</p>
    <div class="stock ${p.stock > 10 ? 'in' : p.stock ? 'low' : 'no'}">${p.stock > 10 ? 'In stock' : p.stock ? `Only ${p.stock} left` : 'Sold out'}</div>
    <div class="buy-row"><div class="qty"><button id="qm" aria-label="Decrease">&minus;</button><span id="qv">1</span><button id="qp" aria-label="Increase">+</button></div>
      <button class="btn" id="addBtn" ${p.stock ? '' : 'disabled'}>Add to cart</button><button class="btn light" style="background:var(--ink);color:#fff" id="buyBtn" ${p.stock ? '' : 'disabled'}>Buy now</button></div>
    <div class="assure"><span>Cash on delivery available</span><span>Delivery in 2-5 working days</span><span>7-day easy returns</span></div></div></div>
  ${related.length ? `<section class="sec"><div class="sec-head"><h2>You may also like</h2></div><div class="grid">${related.map(card).join('')}</div></section>` : ''}`;
  document.querySelectorAll('[data-img]').forEach(b => b.onclick = () => {
    $('#mainImg').innerHTML = imgTag(b.dataset.img, p.name);
    document.querySelectorAll('.thumbs button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#qm').onclick = () => { qty = Math.max(1, qty - 1); $('#qv').textContent = qty; };
  $('#qp').onclick = () => { qty = Math.min(p.stock, qty + 1); $('#qv').textContent = qty; };
  $('#addBtn').onclick = () => addToCart(p, qty, true);
  $('#buyBtn').onclick = () => { addToCart(p, qty); location.hash = '#/checkout'; };
}

function checkout() {
  if (!cart.length) { app.innerHTML = '<div class="empty"><h2>Your cart is empty</h2><br><a class="btn" href="#/shop">Continue shopping</a></div>'; return; }
  const t = totals();
  const saved = JSON.parse(localStorage.getItem('zx_cust') || '{}');
  app.innerHTML = `<div class="co"><form class="form" id="coForm"><h1>Checkout</h1><div id="coErr"></div>
    <div class="two"><label>Full name<input name="name" required autocomplete="name" value="${esc(saved.name)}"></label>
    <label>Phone<input name="phone" type="tel" required placeholder="03xx xxxxxxx" autocomplete="tel" value="${esc(saved.phone)}"></label></div>
    <label>Email (optional)<input name="email" type="email" autocomplete="email" value="${esc(saved.email)}"></label>
    <label>Full address<textarea name="address" rows="2" required autocomplete="street-address">${esc(saved.address)}</textarea></label>
    <label>City<input name="city" required autocomplete="address-level2" value="${esc(saved.city)}"></label>
    <div><b style="font-size:14px">Payment method</b><div class="pay" style="margin-top:8px">
      ${['COD', 'JazzCash', 'Easypaisa', 'Bank Transfer'].map((m, i) => `<label><input type="radio" name="payment" value="${m}" ${i ? '' : 'checked'}>${m === 'COD' ? 'Cash on delivery' : m}</label>`).join('')}</div>
      <p style="font-size:13px;color:var(--muted);margin-top:8px">For JazzCash, Easypaisa or bank transfer, we will contact you on your phone with account details.</p></div>
    <button class="btn" id="placeBtn">Place order - ${rs(t.total)}</button></form>
    <aside class="box"><h3 style="margin-bottom:12px">Order summary</h3>
      ${cart.map(l => `<div class="line" style="grid-template-columns:56px 1fr auto">${imgTag(l.image, l.name, 'style="width:56px;height:56px"')}<div><h4>${esc(l.name)}</h4><small>Qty ${l.qty}</small></div><b>${rs(l.price * l.qty)}</b></div>`).join('')}
      <div class="sum" style="margin-top:12px"><span>Subtotal</span><span>${rs(t.sub)}</span></div><div class="sum"><span>Delivery</span><span>${t.ship ? rs(t.ship) : 'Free'}</span></div>
      <div class="sum total"><span>Total</span><span>${rs(t.total)}</span></div></aside></div>`;
  $('#coForm').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    localStorage.setItem('zx_cust', JSON.stringify(f));
    const btn = $('#placeBtn'); btn.disabled = true; btn.textContent = 'Placing order...';
    try {
      const o = await api('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: f, payment: f.payment, items: cart.map(l => ({ id: l.id, qty: l.qty })) }) });
      cart = []; saveCart(); location.hash = '#/done/' + o.id;
    } catch (err) {
      $('#coErr').innerHTML = `<div class="err">${esc(err.message)}</div>`; btn.disabled = false; btn.textContent = 'Place order'; window.scrollTo(0, 0);
    }
  };
}

function done(id) {
  app.innerHTML = `<div class="done"><div class="tick">&#10003;</div><h1>Thank you, your order is placed</h1>
    <p style="margin:12px 0 20px;color:var(--muted)">Your order number is <b style="color:var(--ink)">#${esc(id)}</b>. We will call you shortly to confirm delivery.</p>
    <a class="btn" href="#/track?id=${esc(id)}">Track order</a> <a class="btn" style="background:var(--soft);color:var(--ink)" href="#/shop">Keep shopping</a></div>`;
}

async function track(params) {
  const id = params.get('id') || '';
  app.innerHTML = `<div class="done"><h1>Track your order</h1><form class="form" id="trForm" style="margin:20px 0"><div class="two" style="grid-template-columns:1fr auto"><input name="id" placeholder="Order number, e.g. 1001" value="${esc(id)}" required><button class="btn">Track</button></div></form><div id="trOut"></div></div>`;
  const run = async id => {
    try {
      const o = await api('/api/orders/track/' + encodeURIComponent(id));
      const steps = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];
      const idx = steps.indexOf(o.status);
      $('#trOut').innerHTML = o.status === 'Cancelled' ? '<div class="err">This order was cancelled.</div>' :
        `<div class="timeline">${steps.map((s, i) => `<div class="${i <= idx ? 'on' : ''}">${s}</div>`).join('')}</div><p>Order #${o.id} &middot; ${rs(o.total)} &middot; ${o.items.map(i => esc(i.name) + ' x' + i.qty).join(', ')}</p>`;
    } catch (err) { $('#trOut').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
  $('#trForm').onsubmit = e => { e.preventDefault(); run(new FormData(e.target).get('id')); };
  if (id) run(id);
}

/* ---------- router ---------- */
async function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const params = new URLSearchParams(qs || '');
  const seg = path.split('/').filter(Boolean);
  document.title = 'Zenorox - Shoes, Watches, Frames, Laptop Stands & More';
  closeCart(); $('#nav').classList.remove('open'); window.scrollTo(0, 0);
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + hash));
  try {
    if (!seg.length) await home();
    else if (seg[0] === 'shop') await shop(params);
    else if (seg[0] === 'product') await product(seg[1]);
    else if (seg[0] === 'checkout') checkout();
    else if (seg[0] === 'done') done(seg[1]);
    else if (seg[0] === 'track') await track(params);
    else app.innerHTML = '<div class="empty"><h2>Page not found</h2><br><a class="btn" href="#/">Back to home</a></div>';
  } catch (err) {
    app.innerHTML = `<div class="empty"><h2>Could not load this page</h2><p>${esc(err.message)}</p><br><a class="btn" href="#/">Back to home</a></div>`;
  }
}

(async function init() {
  $('#yr').textContent = new Date().getFullYear();
  cats = await api('/api/categories');
  $('#nav').innerHTML = `<a href="#/shop">All</a><a href="#/shop?trending=1">Trending</a>` + cats.slice(0, 4).map(c => `<a href="#/shop?category=${c.slug}">${esc(c.name)}</a>`).join('');
  $('#footCats').innerHTML = cats.map(c => `<a href="#/shop?category=${c.slug}">${esc(c.name)}</a>`).join('');
  renderCart();
  window.addEventListener('hashchange', route);
  route();
})();
