const fs = require('fs');
const path = require('path');
const https = require('https');
const { categories, products } = require('../seed');

const dest = path.join(__dirname, '..', 'public', 'img');
fs.mkdirSync(dest, { recursive: true });

const ids = new Set();
const collect = (url) => {
  const m = String(url).match(/\/img\/(photo-[^/.]+)\.jpg/);
  if (m) ids.add(m[1]);
};
categories.forEach(c => collect(c.image));
products.forEach(p => (p.images || []).forEach(collect));

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ZonoroxImageSync', Accept: 'image/*' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('timeout')); });
  });
}

(async () => {
  const list = [...ids];
  let ok = 0, fail = 0;
  for (const id of list) {
    const file = path.join(dest, id + '.jpg');
    if (fs.existsSync(file) && fs.statSync(file).size > 2000) { ok++; continue; }
    const url = `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&h=800&q=80`;
    try {
      const buf = await get(url);
      if (buf.length < 1000) throw new Error('tiny file');
      fs.writeFileSync(file, buf);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      fail++;
      console.log('\nFAIL', id, e.message);
    }
  }
  console.log('\ndownloaded/kept', ok, 'failed', fail, 'of', list.length);
})();
