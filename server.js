const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(express.static('public'));

const datafile = path.join(__dirname, 'data.json');
const usersFile = path.join(__dirname, 'users.json');

function readData(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {}
}

if (!fs.existsSync(datafile)) writeData(datafile, []);
if (!fs.existsSync(usersFile)) writeData(usersFile, []);

app.use((req, res, next) => {
  try {
    const email = req.cookies.user_email;
    if (email) {
      const users = readData(usersFile);
      req.user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase().trim()) || null;
    }
  } catch (e) {
    req.user = null;
  }
  next();
});

const INDONESIA_LOCATIONS = [
  "Cisarua, Bogor, Jawa Barat",
  "Bogor, Jawa Barat",
  "Jakarta Selatan, DKI Jakarta",
  "Jakarta Pusat, DKI Jakarta",
  "Jakarta Barat, DKI Jakarta",
  "Jakarta Timur, DKI Jakarta",
  "Jakarta Utara, DKI Jakarta",
  "Depok, Jawa Barat",
  "Bekasi, Jawa Barat",
  "Tangerang, Banten",
  "Bandung, Jawa Barat",
  "Surabaya, Jawa Timur",
  "Medan, Sumatera Utara",
  "Semarang, Jawa Tengah",
  "Yogyakarta, DI Yogyakarta"
];

const BRANDS_BY_CATEGORY = {
  "Elektronik & Gadget": ["Samsung", "Apple", "Xiaomi", "Oppo", "Vivo", "Asus", "Lenovo", "Sony", "LG", "Realme", "Infinix", "Acer", "MSI", "Fiberhome", "ZTE", "Lainnya"],
  "Kendaraan": ["Honda", "Yamaha", "Suzuki", "Kawasaki", "Toyota", "Daihatsu", "Mitsubishi", "Hyundai", "Vespa", "Lainnya"],
  "Perabotan Rumah": ["IKEA", "Olympic", "Informa", "Dapur Utama", "Local Artisan", "Lainnya"],
  "Hobi & Lainnya": ["Custom / Handmade", "Yamaha Musik", "Roland", "Shimano", "Nike", "Adidas", "Unbranded", "Lainnya"]
};

app.get('/', (req, res) => {
  try {
    const products = readData(datafile);
    const { search, category, brand, condition, lat, lon } = req.query;
    
    // Sembunyikan barang yang sudah terjual dari beranda
    let filtered = products.filter(p => !p.sold);
    
    if (search) {
      filtered = filtered.filter(p => (p.title && p.title.toLowerCase().includes(search.toLowerCase())) || (p.brand && p.brand.toLowerCase().includes(search.toLowerCase())));
    }
    if (category && category !== 'Semua') {
      filtered = filtered.filter(p => p.category === category);
    }
    if (brand && brand !== 'Semua') {
      filtered = filtered.filter(p => p.brand === brand);
    }
    if (condition && condition !== 'Semua') {
      filtered = filtered.filter(p => p.condition === condition);
    }

    const userLat = lat ? parseFloat(lat) : null;
    const userLon = lon ? parseFloat(lon) : null;

    filtered.forEach(p => {
      p._lat = p.lat || -6.6912;
      p._lon = p.lon || 106.9421;
      
      if (userLat && userLon) {
        const dLat = p._lat - userLat;
        const dLon = p._lon - userLon;
        p._distance = Math.sqrt(dLat * dLat + dLon * dLon);
      } else {
        p._distance = 0;
      }
    });

    if (userLat && userLon) {
      filtered.sort((a, b) => a._distance - b._distance);
    } else {
      filtered.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }
    
    return res.render('index', {
      products: filtered,
      search: search || '',
      selectedCategory: category || 'Semua',
      selectedBrand: brand || 'Semua',
      selectedCondition: condition || 'Semua',
      userLat: userLat || '',
      userLon: userLon || '',
      brandsMap: BRANDS_BY_CATEGORY,
      user: req.user || null
    });
  } catch (e) {
    return res.status(500).send("Terjadi kesalahan pada server beranda.");
  }
});

app.all('/login', (req, res) => {
  try {
    if (req.method === 'GET' && !req.query.email && !req.query.name && !req.query.id) {
      if (req.user) return res.redirect('/profile');
      return res.render('login', { user: null });
    }

    let email = req.body.email || req.query.email;
    let name = req.body.name || req.query.name;
    let fbId = req.body.id || req.query.id;
    let avatar = req.body.picture || req.query.picture || req.query.avatar;

    if (!email && fbId) email = `fb_${fbId}@facebook.com`;
    if (!email) email = `fb_user_${Math.floor(Math.random() * 90000) + 10000}@facebook.com`;

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name ? name.trim() : 'Pengguna Facebook';
    const userAvatar = avatar ? avatar.trim() : 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f65';

    let users = readData(usersFile);
    let user = users.find(u => u.email && u.email.toLowerCase() === cleanEmail);

    if (!user) {
      user = { email: cleanEmail, name: cleanName, phone: '', location: 'Cisarua, Bogor, Jawa Barat', avatar: userAvatar, provider: 'facebook' };
      users.push(user);
      writeData(usersFile, users);
    }

    res.cookie('user_email', cleanEmail, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.redirect('/profile');
  } catch (err) {
    return res.redirect('/');
  }
});

app.get('/product/:id', (req, res) => {
  try {
    const products = readData(datafile);
    const targetId = String(req.params.id || '').trim();
    const product = products.find(p => String(p.id || '').trim() === targetId);
    
    if (!product) return res.status(404).send('Maaf, detail produk tidak ditemukan.');
    
    return res.render('product', { product, user: req.user || null });
  } catch (e) {
    return res.redirect('/');
  }
});

app.get('/sell', (req, res) => {
  if (!req.user) return res.redirect('/login');
  return res.render('sell', { user: req.user, locations: INDONESIA_LOCATIONS, brandsMap: BRANDS_BY_CATEGORY });
});

app.post('/sell', (req, res) => {
  try {
    if (!req.user) return res.redirect('/login');
    
    const title = req.body.title;
    const price = Number(String(req.body.price || '0').replace(/[^0-9]/g, '')) || 0;
    const category = req.body.category || 'Elektronik & Gadget';
    const brand = req.body.brand || 'Lainnya';
    const condition = req.body.condition || 'Bekas';
    const damagePercent = condition === 'Bekas' ? (req.body.damage_percent || '90%') : '100%';
    const location = req.body.location || req.user.location || 'Cisarua, Bogor, Jawa Barat';
    
    // Pastikan nomor whatsapp terformat dengan +62 di depan
    let rawWa = String(req.body.whatsapp || '').replace(/[^0-9]/g, '');
    if (rawWa.startsWith('0')) rawWa = rawWa.substring(1);
    const whatsapp = '+62' + rawWa;

    const description = req.body.description || '';
    
    let images = [];
    if (Array.isArray(req.body.images)) {
      images = req.body.images.filter(img => img);
    } else if (req.body.images) {
      images = [req.body.images];
    }
    if (images.length === 0) {
      images = ['https://images.unsplash.com/photo-1581091226825-a6a2a5aee158'];
    }

    if (!title || !price) return res.redirect('/sell');

    const products = readData(datafile);
    const lastId = products.length > 0 ? (Number(products[products.length - 1].id) || products.length) : 0;
    
    const newProduct = {
      id: lastId + 1,
      title: String(title).trim(),
      price: price,
      category: String(category).trim(),
      brand: String(brand).trim(),
      condition: String(condition).trim(),
      damage_percent: String(damagePercent).trim(),
      location: String(location).trim(),
      whatsapp: whatsapp,
      description: String(description).trim(),
      images: images,
      image: images[0],
      seller_email: req.user.email,
      seller_name: req.user.name,
      sold: false,     // false = Aktif, true = Terjual
      booked: false,   // true = Dibooking
      created_at: new Date().toLocaleDateString('id-ID')
    };

    products.push(newProduct);
    writeData(datafile, products);
    return res.redirect('/profile');
  } catch (e) {
    return res.redirect('/sell');
  }
});

app.get('/profile', (req, res) => {
  if (!req.user) return res.redirect('/login');
  try {
    const products = readData(datafile);
    const myProducts = products.filter(p => p.seller_email && req.user.email && p.seller_email.toLowerCase() === req.user.email.toLowerCase());
    return res.render('profile', { user: req.user, myProducts: myProducts });
  } catch (e) {
    return res.render('profile', { user: req.user, myProducts: [] });
  }
});

// Ubah status jadi Terjual
app.post('/profile/status/:id/:status', (req, res) => {
  if (!req.user) return res.redirect('/login');
  try {
    const products = readData(datafile);
    const targetId = String(req.params.id);
    const actionStatus = req.params.status; // 'sold', 'booked', 'active'
    
    const prod = products.find(p => String(p.id) === targetId && p.seller_email && p.seller_email.toLowerCase() === req.user.email.toLowerCase());
    if (prod) {
      if (actionStatus === 'sold') {
        prod.sold = true;
        prod.booked = false;
      } else if (actionStatus === 'booked') {
        prod.sold = false;
        prod.booked = true;
      } else if (actionStatus === 'active') {
        prod.sold = false;
        prod.booked = false;
      }
      writeData(datafile, products);
    }
  } catch (e) {}
  return res.redirect('/profile');
});

// Hapus Iklan
app.post('/profile/delete/:id', (req, res) => {
  if (!req.user) return res.redirect('/login');
  try {
    let products = readData(datafile);
    const targetId = String(req.params.id);
    products = products.filter(p => !(String(p.id) === targetId && p.seller_email && p.seller_email.toLowerCase() === req.user.email.toLowerCase()));
    writeData(datafile, products);
  } catch (e) {}
  return res.redirect('/profile');
});

app.get('/logout', (req, res) => {
  res.clearCookie('user_email');
  return res.redirect('/login');
});

app.listen(PORT, () => {
  console.log(`Server aktif di port ${PORT}`);
});
