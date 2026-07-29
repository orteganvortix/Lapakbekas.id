const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Global User Middleware
app.use((req, res, next) => {
  const email = req.cookies.user_email;
  if (email) {
    const users = readData(usersFile);
    const foundUser = users.find(u => u.email === email);
    if (foundUser) {
      if (foundUser.name === "Pengguna Facebook" || (foundUser.name && foundUser.name.toLowerCase().includes("user.fb"))) {
        foundUser.name = email.split('@')[0];
        writeData(usersFile, users);
      }
      req.user = foundUser;
    }
  }
  next();
});

// 1. Home Route
app.get('/', (req, res) => {
  const products = readData(datafile);
  const { search, category, condition, location } = req.query;
  
  let filtered = products;
  if (search) {
    filtered = filtered.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
  }
  if (category && category !== 'Semua') {
    filtered = filtered.filter(p => p.category === category);
  }
  if (condition && condition !== 'Semua') {
    filtered = filtered.filter(p => p.condition === condition);
  }
  if (location && location !== 'Semua') {
    filtered = filtered.filter(p => p.location.toLowerCase().includes(location.toLowerCase()));
  }
  
  filtered.sort((a, b) => b.id - a.id);
  
  res.render('index', {
    products: filtered,
    search: search || '',
    selectedCategory: category || 'Semua',
    selectedCondition: condition || 'Semua',
    selectedLocation: location || 'Semua',
    user: req.user || null
  });
});

// 2. Login Page
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/profile');
  res.render('login', { user: req.user || null });
});

// 3. Login Handler (Google & Facebook Mock/Direct)
app.post('/login', (req, res) => {
  let { email, name, provider } = req.body;
  if (!email) return res.redirect('/login');

  const cleanEmail = email.trim().toLowerCase();
  let cleanName = name ? name.trim() : '';

  if (!cleanName || cleanName === 'Pengguna Facebook' || cleanName.toLowerCase().includes('user.fb')) {
    cleanName = cleanEmail.split('@')[0];
  }

  const authProvider = provider || 'google';
  let autoAvatar = authProvider === 'facebook'
    ? 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f65'
    : 'https://images.unsplash.com/photo-1534528741775-53994a69dae8';

  let users = readData(usersFile);
  let user = users.find(u => u.email === cleanEmail);

  if (!user) {
    user = {
      email: cleanEmail,
      name: cleanName,
      phone: '',
      location: '',
      avatar: autoAvatar,
      provider: authProvider,
      joined_at: new Date().toLocaleDateString('id-ID')
    };
    users.push(user);
    writeData(usersFile, users);
  } else if (!user.name || user.name === 'Pengguna Facebook' || user.name.toLowerCase().includes('user.fb')) {
    user.name = cleanName;
    writeData(usersFile, users);
  }

  res.cookie('user_email', cleanEmail, { maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.cookie('user_name', user.name, { maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.cookie('user_provider', authProvider, { maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.cookie('user_avatar', user.avatar, { maxAge: 30 * 24 * 60 * 60 * 1000 });

  res.redirect('/profile');
});

// 4. Product Detail Route
app.get('/product/:id', (req, res) => {
  const products = readData(datafile);
  const product = products.find(p => p.id == req.params.id);
  if (!product) return res.status(404).send('Produk tidak ditemukan');
  res.render('product', { product, user: req.user || null });
});

// 5. Sell Route (Get & Post)
app.get('/sell', (req, res) => {
  if (!req.user) return res.redirect('/login');
  res.render('sell', { user: req.user });
});

app.post('/sell', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const { title, price, category, condition, location, description, image } = req.body;
  const products = readData(datafile);
  
  const newProduct = {
    id: products.length > 0 ? products[products.length - 1].id + 1 : 1,
    title,
    price: Number(price),
    category,
    condition,
    location,
    description,
    image: image || 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158',
    seller_email: req.user.email,
    seller_name: req.user.name,
    seller_phone: req.user.phone || '',
    created_at: new Date().toLocaleDateString('id-ID')
  };

  products.push(newProduct);
  writeData(datafile, products);
  res.redirect('/');
});

// 6. Profile Route (Get & Post)
app.get('/profile', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const products = readData(datafile);
  const myProducts = products.filter(p => p.seller_email === req.user.email);
  res.render('profile', { user: req.user, products: myProducts });
});

app.post('/profile', (req, res) => {
  if (!req.user) return res.redirect('/login');
  let users = readData(usersFile);
  let index = users.findIndex(u => u.email === req.user.email);
  if (index !== -1) {
    users[index].name = req.body.name || users[index].name;
    users[index].phone = req.body.phone || users[index].phone;
    users[index].location = req.body.location || users[index].location;
    writeData(usersFile, users);
  }
  res.redirect('/profile');
});

// 7. Logout Route
app.get('/logout', (req, res) => {
  res.clearCookie('user_email');
  res.clearCookie('user_name');
  res.clearCookie('user_provider');
  res.clearCookie('user_avatar');
  res.redirect('/login');
});

app.listen(PORT, () => {
  console.log(`LAPAKBEKAS.ID Aktif di http://localhost:${PORT}`);
});
