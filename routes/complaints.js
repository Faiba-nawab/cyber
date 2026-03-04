const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');

// ======================================================
// MULTER SETUP
// ======================================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });


// ======================================================
// GET ALL COMPLAINTS (ADMIN) + FILTER
// ======================================================
router.get('/', (req, res) => {

    const { status, priority } = req.query;

    let query = `
        SELECT 
            c.complaint_id,
            u.full_name,
            cat.category_name,
            o.officer_name,
            c.status,
            c.priority,
            c.complaint_date,
            e.file_path
        FROM complaints c
        JOIN users u ON c.user_id = u.user_id
        JOIN categories cat ON c.category_id = cat.category_id
        LEFT JOIN officers o ON c.officer_id = o.officer_id
        LEFT JOIN evidence e ON c.complaint_id = e.complaint_id
        WHERE 1=1
    `;

    const params = [];

    if (status) {
        query += " AND c.status = ?";
        params.push(status);
    }

    if (priority) {
        query += " AND c.priority = ?";
        params.push(priority);
    }

    query += " ORDER BY c.complaint_date DESC";

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


// ======================================================
// ADD COMPLAINT
// ======================================================
router.post('/add', upload.single('evidence'), (req, res) => {

    const { user_id, category_id, officer_id, description, priority } = req.body;

    if (!user_id || !category_id || !description || !priority) {
        return res.status(400).json({ error: "Required fields missing" });
    }

    const insertComplaint = `
        INSERT INTO complaints 
        (user_id, category_id, officer_id, description, status, priority)
        VALUES (?, ?, ?, ?, 'Open', ?)
    `;

    db.query(insertComplaint,
        [user_id, category_id, officer_id || null, description, priority],
        (err, result) => {

            if (err) return res.status(500).json({ error: err.sqlMessage });

            const complaintId = result.insertId;

            // Insert Log
            db.query(
                `INSERT INTO complaint_logs (complaint_id, action, performed_by)
                 VALUES (?, 'Complaint Submitted', 'User')`,
                [complaintId]
            );

            // Save evidence if exists
            if (req.file) {
                db.query(
                    `INSERT INTO evidence (complaint_id, file_path)
                     VALUES (?, ?)`,
                    [complaintId, req.file.filename],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: err2.sqlMessage });
                        return res.json({ message: "Complaint + Evidence uploaded successfully" });
                    }
                );
            } else {
                return res.json({ message: "Complaint submitted successfully" });
            }
        }
    );
});


// ======================================================
// USER COMPLAINTS
// ======================================================
router.get('/user/:id', (req, res) => {

    const query = `
        SELECT 
            c.complaint_id AS id,
            c.description,
            c.status,
            c.priority,
            c.complaint_date,
            cat.category_name AS category,
            o.officer_name AS officer,
            e.file_path
        FROM complaints c
        JOIN categories cat ON c.category_id = cat.category_id
        LEFT JOIN officers o ON c.officer_id = o.officer_id
        LEFT JOIN evidence e ON c.complaint_id = e.complaint_id
        WHERE c.user_id = ?
        ORDER BY c.complaint_date DESC
    `;

    db.query(query, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


// ======================================================
// ADMIN UPDATE STATUS
// Open → Under Investigation → Closed
// ======================================================
router.put('/update-status/:id', (req, res) => {

    const { status } = req.body;

    const allowedStatuses = ['Under Investigation', 'Closed'];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status update" });
    }

    const query = `
        UPDATE complaints
        SET status = ?
        WHERE complaint_id = ?
        AND status IN ('Open','Under Investigation')
        AND status != 'Withdrawn'
    `;

    db.query(query, [status, req.params.id], (err, result) => {

        if (err) return res.status(500).json({ error: err.message });

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: "Status update not allowed." });
        }

        // Insert Log
        db.query(
            `INSERT INTO complaint_logs (complaint_id, action, performed_by)
             VALUES (?, ?, 'Admin')`,
            [req.params.id, `Status changed to ${status}`]
        );

        res.json({ message: "Status updated successfully" });
    });
});


// ======================================================
// USER WITHDRAW (Only if Open)
// ======================================================
router.put('/withdraw/:id', (req, res) => {

    const query = `
        UPDATE complaints
        SET status = 'Withdrawn'
        WHERE complaint_id = ?
        AND status = 'Open'
    `;

    db.query(query, [req.params.id], (err, result) => {

        if (err) return res.status(500).json({ error: err.message });

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: "Cannot withdraw. Already processed." });
        }

        db.query(
            `INSERT INTO complaint_logs (complaint_id, action, performed_by)
             VALUES (?, 'Complaint Withdrawn', 'User')`,
            [req.params.id]
        );

        res.json({ message: "Complaint withdrawn successfully" });
    });
});


// ======================================================
// EDIT COMPLAINT (Only if Open)
// ======================================================
router.put('/edit/:id', (req, res) => {

    const { description, category_id, priority } = req.body;

    if (!description || !category_id || !priority) {
        return res.status(400).json({ error: "All fields required." });
    }

    const query = `
        UPDATE complaints 
        SET description = ?, category_id = ?, priority = ?
        WHERE complaint_id = ?
        AND status = 'Open'
    `;

    db.query(query,
        [description, category_id, priority, req.params.id],
        (err, result) => {

            if (err) return res.status(500).json({ error: err.message });

            if (result.affectedRows === 0) {
                return res.status(400).json({ error: "Cannot edit. Already processed." });
            }

            db.query(
                `INSERT INTO complaint_logs (complaint_id, action, performed_by)
                 VALUES (?, 'Complaint Edited', 'User')`,
                [req.params.id]
            );

            res.json({ message: "Complaint updated successfully" });
        }
    );
});


// ======================================================
// GET TIMELINE / LOGS
// ======================================================
router.get('/logs/:id', (req, res) => {

    db.query(
        `SELECT action, performed_by, created_at
         FROM complaint_logs
         WHERE complaint_id = ?
         ORDER BY created_at ASC`,
        [req.params.id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});


// ======================================================
// CATEGORY REPORT
// ======================================================
router.get('/report/category', (req, res) => {

    db.query(
        `SELECT cat.category_name, COUNT(c.complaint_id) AS total
         FROM complaints c
         JOIN categories cat ON c.category_id = cat.category_id
         GROUP BY cat.category_name`,
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});


// ======================================================
// GET CATEGORIES
// ======================================================
router.get('/api/categories', (req, res) => {

    db.query(
        "SELECT category_id AS id, category_name AS name FROM categories",
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});


// ======================================================
// GET OFFICERS
// ======================================================
router.get('/api/officers', (req, res) => {

    db.query(
        "SELECT officer_id AS id, officer_name AS name FROM officers",
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});

module.exports = router;