const express = require('express');
const app = express();
const db = require('./db'); // your DB connection
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // serve your HTML/JS files
const path = require('path');

app.use('/uploads', express.static(path.join(__dirname,'uploads')));

const authRoutes = require('./routes/auth');
const complaintRoutes = require('./routes/complaints');

// Mount routes
app.use('/auth', authRoutes);           // /auth/login, /auth/register
app.use('/complaints', complaintRoutes); // /complaints/... endpoints

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});