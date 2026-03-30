const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/register', (req, res) => {

    const { full_name, email, phone, address, password } = req.body;

    // EMAIL VALIDATION (must end with @gmail.com)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

    if(!emailRegex.test(email)){
        return res.status(400).json({
            message: "Email must be a valid @gmail.com address"
        });
    }

    // PASSWORD VALIDATION (minimum 6 characters)
    if(password.length < 6){
        return res.status(400).json({
            message: "Password must be at least 6 characters"
        });
    }
    // PHONE NUMBER VALIDATION (must be exactly 10 digits)
    if(!/^\d{10}$/.test(phone)){
    return res.status(400).json({
        message: "Phone number must be exactly 10 digits"
    });
    }

    const query = `
        INSERT INTO users (full_name, email, phone, address, password)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(query, [full_name, email, phone, address, password], (err, result) => {

        if (err) {
            return res.status(500).json({ message: "Email already exists" });
        }

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