const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(express.static('public'));

const datafile = path.join(__dirname, 'data.json');
const usersFile = path.join(__dirname, 'users.json');
const uploadsDir = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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

if (!fs.existsSync(datafile)) {
  writeData(datafile, []);
}
if (!fs.existsSync(usersFile)) {
  writeData(usersFile, []);
}

app.use((req, res, next) => {
  try {
    const email = req.cookies.user_email;
    if (email) {
      const users = readData(usersFile);
      const foundUser = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase().trim());
      if (foundUser) {
        req.user = foundUser;
      }
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
    const { search, category, condition, location, brand } = req.query;
    
    let filtered = products;
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
    if (location && location !== 'Semua') {
      filtered = filtered.filter(p => p.location && p.location.toLowerCase().includes(location.toLowerCase()));
    }
    
    filtered.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    
    return res.render('index', {
      products: filtered,
      search: search || '',
      selectedCategory: category || 'Semua',
      selectedBrand: brand || 'Semua',
      selectedCondition: condition || 'Semua',
      selectedLocation: location || 'Semua',
      locations: INDONESIA_LOCATIONS,
      brandsMap: BRANDS_BY_CATEGORY,
      user: req.user || null,
      currentUser: req.user || null
    });
  } catch (e) {
    return res.status(500).send("Terjadi kesalahan pada server beranda.");
  }
});

app.all('/login', (req, res) => {
  try {
    if (req.method === 'GET' && !req.query.email && !req.query.name && !req.query.id && !req.query.access_token) {
      if (req.user) return res.redirect('/profile');
      return res.render('login', { user: null, currentUser: null });
    }

    let email = req.body.email || req.query.email;
    let name = req.body.name || req.query.name;
    let fbId = req.body.id || req.query.id;
    let avatar = req.body.picture || req.query.picture || req.query.avatar;

    if (!email && fbId) {
      email = `fb_${fbId}@facebook.com`;
    }
    if (!email) {
      email = `fb_user_${Math.floor(Math.random() * 90000) + 10000}@facebook.com`;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name ? name.trim() : 'Pengguna Facebook';
    const userAvatar = avatar ? avatar.trim() : 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f65';

    let users = readData(usersFile);
    let user = users.find(u => u.email && u.email.toLowerCase() === cleanEmail);

    if (!user) {
      user = {
        email: cleanEmail,
        name: cleanName,
        phone: '',
        location: 'Cisarua, Bogor, Jawa Barat',
        avatar: userAvatar,
        provider: 'facebook',
        facebook_id: fbId || '',
        joined_at: new Date().toLocaleDateString('id-ID')
      };
      users.push(user);
      writeData(usersFile, users);
    } else {
      if (name) user.name = cleanName;
      if (avatar) user.avatar = userAvatar;
      user.provider = 'facebook';
      if (fbId) user.facebook_id = fbId;
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
    
    if (!product) {
      return res.status(404).send('Maaf, detail produk tidak ditemukan.');
    }
    
    const users = readData(usersFile);
    const seller = users.find(u => u.email && product.seller_email && u.email.toLowerCase() === product.seller_email.toLowerCase()) || {
      name: product.seller_name || 'Penjual',
      email: product.seller_email || '',
      phone: product.seller_phone || '',
      avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f65'
    };
    
    return res.render('product', { 
      product, 
      seller, 
      user: req.user || null,
      currentUser: req.user || null 
    });
  } catch (e) {
    return res.redirect('/');
  }
});

app.get('/sell', (req, res) => {
  if (!req.user) return res.redirect('/login');
  return res.render('sell', { 
    user: req.user, 
    currentUser: req.user,
    locations: INDONESIA_LOCATIONS,
    brandsMap: BRANDS_BY_CATEGORY
  });
});

app.post('/sell', (req, res) => {
  try {
    if (!req.user) return res.redirect('/login');
    
    const title = req.body.title || req.body.name || req.body.barang || req.body.judul;
    const priceRaw = req.body.price || req.body.harga || '0';
    const price = Number(String(priceRaw).replace(/[^0-9]/g, '')) || 0;
    const category = req.body.category || req.body.kategori || 'Elektronik & Gadget';
    const brand = req.body.brand || req.body.merk || 'Lainnya';
    const condition = req.body.condition || req.body.kondisi || 'Bekas';
    const damagePercent = condition === 'Bekas' ? (req.body.damage_percent || req.body.kerusakan || '10% (Mulus)') : '0% (Baru)';
    const location = req.body.location || req.body.lokasi || req.user.location || 'Cisarua, Bogor, Jawa Barat';
    const description = req.body.description || req.body.deskripsi || '';
    
    let image = req.body.image || req.body.foto_url || '';
    if (req.body.image_base64) {
      image = req.body.image_base64;
    } else if (!image) {
      image = 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158';
    }

    if (!title || !price || !brand) {
      return res.redirect('/sell');
    }

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
      description: String(description).trim(),
      image: String(image).trim(),
      seller_email: req.user.email,
      seller_name: req.user.name,
      seller_phone: req.user.phone || '',
      created_at: new Date().toLocaleDateString('id-ID')
    };

    products.push(newProduct);
    writeData(datafile, products);
    return res.redirect('/');
  } catch (e) {
    return res.redirect('/sell');
  }
});

app.get('/profile', (req, res) => {
  if (!req.user) return res.redirect('/login');
  try {
    const products = readData(datafile);
    const myProducts = products.filter(p => p.seller_email && req.user.email && p.seller_email.toLowerCase() === req.user.email.toLowerCase());
    return res.render('profile', { 
      user: req.user, 
      currentUser: req.user, 
      products: myProducts,
      myProducts: myProducts 
    });
  } catch (e) {
    return res.render('profile', { 
      user: req.user, 
      currentUser: req.user, 
      products: [],
      myProducts: [] 
    });
  }
});

app.post('/profile', (req, res) => {
  if (!req.user) return res.redirect('/login');
  try {
    let users = readData(usersFile);
    let index = users.findIndex(u => u.email && req.user.email && u.email.toLowerCase() === req.user.email.toLowerCase());
    if (index !== -1) {
      users[index].name = req.body.name ? req.body.name.trim() : users[index].name;
      users[index].phone = req.body.phone ? req.body.phone.trim() : users[index].phone;
      users[index].location = req.body.location ? req.body.location.trim() : users[index].location;
      writeData(usersFile, users);
    }
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
