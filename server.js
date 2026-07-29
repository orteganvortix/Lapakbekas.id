const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

const dbFile = path.join(__dirname, 'data.json');
const usersFile = path.join(__dirname, 'users.json');

const readData = (file) => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify([]));
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return [];
    }
};

const writeData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// Konfigurasi Multer untuk Upload Banyak Foto (Max 10 foto) & Avatar
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { files: 10 }
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware Global User & Autentikasi
app.use((req, res, next) => {
    const userEmail = req.cookies.user_email;
    if (userEmail) {
        const users = readData(usersFile);
        const profile = users.find(u => u.email === userEmail);
        
        let finalAvatar = req.cookies.user_avatar || '/uploads/default-avatar.png';
        if (profile && profile.avatar) finalAvatar = profile.avatar;

        req.user = { 
            email: userEmail, 
            name: profile ? profile.name : 'Pengguna',
            avatar: finalAvatar,
            provider: profile ? profile.provider : 'google',
            // Dianggap lengkap jika nomor WhatsApp dan location sudah terisi di database
            isProfileComplete: profile ? Boolean(profile.phone && profile.location) : false
        };
    } else {
        req.user = null;
    }
    res.locals.user = req.user;
    next();
});

// --- ROUTES ---

// Beranda dengan Rekomendasi Berdasarkan Kecamatan/Wilayah
app.get('/', (req, res) => {
    const { search, category, condition, location } = req.query;
    let products = readData(dbFile);

    if (search) {
        const keyword = search.toLowerCase();
        products = products.filter(p => 
            p.title.toLowerCase().includes(keyword) || 
            p.description.toLowerCase().includes(keyword) ||
            p.location.toLowerCase().includes(keyword)
        );
    }

    if (category && category !== 'Semua') {
        products = products.filter(p => p.category === category);
    }

    if (condition && condition !== 'Semua') {
        products = products.filter(p => p.condition === condition);
    }

    if (location && location !== 'Semua') {
        products = products.filter(p => p.location.toLowerCase().includes(location.toLowerCase()));
    }

    products.sort((a, b) => b.id - a.id);
    res.render('index', { 
        products, 
        search: search || '', 
        selectedCategory: category || 'Semua',
        selectedCondition: condition || 'Semua',
        selectedLocation: location || 'Semua'
    });
});

// Halaman Login (Mendukung Simulasi Google & Facebook Login dengan PP Otomatis)
app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/profile');
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, name, provider } = req.body;
    if (!email) return res.redirect('/login');

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name ? name.trim() : cleanEmail.split('@')[0];
    const authProvider = provider || 'google';

    // Set Foto Profil otomatis berdasarkan Provider Login
    let autoAvatar = authProvider === 'facebook' 
        ? 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150' // Contoh PP FB
        : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'; // Contoh PP Google

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
    }

    res.cookie('user_email', cleanEmail, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.cookie('user_name', user.name, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.cookie('user_provider', authProvider, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.cookie('user_avatar', user.avatar, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    
    res.redirect('/profile');
});

// Profil Pengguna (Jika sudah lengkap, form edit disembunyikan & tombol keluar diganti kembali ke beranda)
app.get('/profile', (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    const products = readData(dbFile);
    const myProducts = products.filter(p => p.seller_email === req.user.email);

    const users = readData(usersFile);
    let currentUser = users.find(u => u.email === req.user.email) || { 
        name: req.user.name, 
        email: req.user.email, 
        phone: '', 
        location: '',
        avatar: req.user.avatar,
        provider: req.user.provider
    };

    const editMode = req.query.edit === 'true';

    res.render('profile', { myProducts, currentUser, editMode });
});

app.post('/profile/update', upload.single('avatar'), (req, res) => {
    if (!req.user) return res.redirect('/login');

    const { name, phone, location } = req.body;
    let users = readData(usersFile);
    let userIndex = users.findIndex(u => u.email === req.user.email);

    let avatarPath = req.file ? `/uploads/${req.file.filename}` : null;

    if (userIndex !== -1) {
        users[userIndex].name = name || users[userIndex].name;
        users[userIndex].phone = phone || users[userIndex].phone;
        users[userIndex].location = location || users[userIndex].location;
        if (avatarPath) {
            users[userIndex].avatar = avatarPath;
            res.cookie('user_avatar', avatarPath, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
        }
    } else {
        users.push({
            email: req.user.email,
            name: name || req.user.name,
            phone: phone || '',
            location: location || '',
            avatar: avatarPath || req.user.avatar,
            provider: req.user.provider
        });
    }

    writeData(usersFile, users);
    res.cookie('user_name', name || req.user.name, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.redirect('/profile');
});

// Halaman Jual Barang (Multi-foto hingga 10 foto)
app.get('/sell', (req, res) => {
    if (!req.user) return res.redirect('/login');
    const users = readData(usersFile);
    const currentUser = users.find(u => u.email === req.user.email);
    res.render('sell', { currentUser });
});

app.post('/sell', upload.array('images', 10), (req, res) => {
    if (!req.user) return res.redirect('/login');

    const { title, price, category, condition, location, whatsapp, description } = req.body;
    
    // Ambil array path gambar yang di-upload (minimal 1, maksimal 10)
    let images = req.files && req.files.length > 0 
        ? req.files.map(file => `/uploads/${file.filename}`) 
        : ['/uploads/default.png'];

    // Bersihkan titik format harga jika dikirim dengan titik
    const cleanPrice = Number(price.replace(/\./g, ''));

    const products = readData(dbFile);
    const newProduct = {
        id: products.length > 0 ? products[products.length - 1].id + 1 : 1,
        title,
        price: cleanPrice,
        category,
        condition,
        location,
        whatsapp,
        description,
        images, // Menyimpan array foto (bisa digeser/slider)
        image: images[0], // Cover utama
        seller_email: req.user.email,
        seller_name: req.user.name,
        created_at: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    };

    products.push(newProduct);
    writeData(dbFile, products);

    res.redirect('/profile');
});

// Detail Produk dengan Slider Foto
app.get('/product/:id', (req, res) => {
    const productId = Number(req.params.id);
    const products = readData(dbFile);
    const product = products.find(p => p.id === productId);

    if (!product) return res.status(404).send('Produk tidak ditemukan.');

    const users = readData(usersFile);
    const seller = users.find(u => u.email === product.seller_email) || { name: product.seller_name, avatar: '/uploads/default-avatar.png' };

    res.render('product', { product, seller });
});

app.delete('/product/:id', (req, res) => {
    if (!req.user) return res.redirect('/login');

    const productId = Number(req.params.id);
    let products = readData(dbFile);
    const productIndex = products.findIndex(p => p.id === productId);

    if (productIndex !== -1) {
        const product = products[productIndex];
        if (product.seller_email === req.user.email) {
            products.splice(productIndex, 1);
            writeData(dbFile, products);
        }
    }

    res.redirect('/profile');
});

app.listen(PORT, () => {
    console.log(`LAPAKBEKAS.ID Aktif di http://localhost:${PORT}`);
});
