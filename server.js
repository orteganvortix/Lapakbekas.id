const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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

app.get('/', (req, res) => {
  try {
    const products = readData(datafile);
    const { search, category, condition, location } = req.query;
    
    let filtered = products;
    if (search) {
      filtered = filtered.filter(p => p.title && p.title.toLowerCase().includes(search.toLowerCase()));
    }
    if (category && category !== 'Semua') {
      filtered = filtered.filter(p => p.category === category);
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
      selectedCondition: condition || 'Semua',
      selectedLocation: location || 'Semua',
      user: req.user || null,
      currentUser: req.user || null
    });
  } catch (e) {
    return res.status(500).send("Terjadi kesalahan pada server beranda.");
  }
});

app.all('/login', (req, res) => {
  try {
    if (req.method === 'GET' && !req.query.email && !req.query.name && !req.query.id) {
      if (req.user) return res.redirect('/profile');
      return res.render('login', { user: null, currentUser: null });
    }

    let email = req.body.email || req.query.email;
    let name = req.body.name || req.query.name;
    let fbId = req.body.id || req.query.id;
    let avatar = req.body.picture || req.query.picture;
    let provider = 'facebook';

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
        location: '',
        avatar: userAvatar,
        provider: provider,
        facebook_id: fbId || '',
        joined_at: new Date().toLocaleDateString('id-ID')
      };
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
  return res.render('sell', { user: req.user, currentUser: req.user });
});

// Perbaikan Total pada Penanganan Form Tambah Iklan (Sell)
app.post('/sell', (req, res) => {
  try {
    if (!req.user) return res.redirect('/login');
    
    // Menangkap seluruh kemungkinan nama field dari form frontend Anda
    const title = req.body.title || req.body.nama_barang || req.body.judul;
    const price = req.body.price || req.body.harga;
    const category = req.body.category || req.body.kategori;
    const condition = req.body.condition || req.body.kondisi;
    const location = req.body.location || req.body.lokasi || req.user.location;
    const description = req.body.description || req.body.deskripsi;
    const image = req.body.image || req.body.foto || req.body.img;

    const products = readData(datafile);
    const lastId = products.length > 0 ? (Number(products[products.length - 1].id) || products.length) : 0;
    
    const newProduct = {
      id: lastId + 1,
      title: title ? String(title).trim() : 'Tanpa Judul',
      price: price ? Number(String(price).replace(/[^0-9]/g, '')) || 0 : 0,
      category: category ? String(category).trim() : 'Lainnya',
      condition: condition ? String(condition).trim() : 'Bekas',
      location: location ? String(location).trim() : 'Indonesia',
      description: description ? String(description).trim() : '',
      image: image ? String(image).trim() : 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158',
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
