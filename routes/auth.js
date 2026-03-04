const express = require('express');
const router = express.Router();
const db = require('../db');

// REGISTER
router.post('/register', (req, res) => {
    const { full_name, email, phone, address, password } = req.body;

    const query = `
        INSERT INTO users (full_name, email, phone, address, password)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(query, [full_name, email, phone, address, password], (err, result) => {
        if (err) return res.status(500).json({ message: "Email already exists" });
        res.json({ message: "Registration successful" });
    });
});

// LOGIN
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    const query = `
        SELECT * FROM users
        WHERE email = ? AND password = ?
    `;

    db.query(query, [email, password], (err, results) => {
        if (err) return res.status(500).json({ message: "Server error" });

        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        res.json({
            message: "Login successful",
            user: results[0]
        });
    });
});

module.exports = router;