const express = require('express');
const app = express();
const db = require('./db'); // your DB connection

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // serve your HTML/JS files
app.use('/uploads', express.static('uploads'));

const authRoutes = require('./routes/auth');
const complaintRoutes = require('./routes/complaints');

// Mount routes
app.use('/auth', authRoutes);           // /auth/login, /auth/register
app.use('/complaints', complaintRoutes); // /complaints/... endpoints

app.listen(5000, () => {
  console.log('Server running on port 5000');
});