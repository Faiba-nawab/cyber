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

const upload = multer({ storage });


// ======================================================
// OFFICER WORKLOAD VIEW
// ======================================================
router.get('/officer-workload', (req, res) => {

    const sql = "SELECT * FROM officer_workload_view ORDER BY total_cases DESC";

    db.query(sql, (err, result) => {

        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(result);
    });

});


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
            o.phone AS officer_phone,
            c.description,
            c.status,
            c.priority,
            c.complaint_date,
            e.file_path
        FROM complaints c
        JOIN users u ON c.user_id = u.user_id
        JOIN categories cat ON c.category_id = cat.category_id
        LEFT JOIN officers o ON c.officer_id = o.officer_id
        LEFT JOIN evidence e ON c.complaint_id = e.complaint_id
        WHERE c.status != 'Closed'
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
// ADD COMPLAINT (USER)
// PRIORITY NOT INCLUDED
// ======================================================
router.post('/add', upload.single('evidence'), (req, res) => {

    const { user_id, category_id, officer_id, description } = req.body;

    if (!user_id || !category_id || !description) {
        return res.status(400).json({ error: "Required fields missing" });
    }

    const insertComplaint = `
        INSERT INTO complaints 
        (user_id, category_id, officer_id, description, status)
        VALUES (?, ?, ?, ?, 'Open')
    `;

    db.query(insertComplaint,
        [user_id, category_id, officer_id || null, description],
        (err, result) => {

            if (err) return res.status(500).json({ error: err.sqlMessage });

            const complaintId = result.insertId;

            db.query(
                `INSERT INTO complaint_logs (complaint_id, action, performed_by)
                 VALUES (?, 'Complaint Submitted', 'User')`,
                [complaintId]
            );

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
    o.phone AS officer_phone,
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
    `;

    db.query(query, [status, req.params.id], (err, result) => {

        if (err) {
            console.log("Status Update Error:", err);
            return res.status(500).json({ error: err.message });
        }

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: "Status update not allowed." });
        }

        db.query(
            `INSERT INTO complaint_logs (complaint_id, action, performed_by)
             VALUES (?, ?, ?)`,
            [req.params.id, `Status changed to ${status}`, 'Admin'],
            (logErr) => {
                if (logErr) {
                    console.log("Log Error:", logErr);
                }
            }
        );

        res.json({ message: "Status updated successfully" });

    });

});


// ======================================================
// ADMIN UPDATE PRIORITY
// ======================================================
router.put('/update-priority/:id', (req, res) => {

    const { priority } = req.body;

    const allowed = ['Low','Medium','High'];

    if (!allowed.includes(priority)) {
        return res.status(400).json({ error: "Invalid priority" });
    }

    db.query(
        `UPDATE complaints SET priority=? WHERE complaint_id=?`,
        [priority, req.params.id],
        (err,result)=>{

            if(err) return res.status(500).json({error:err.message});

            db.query(
            `INSERT INTO complaint_logs (complaint_id, action, performed_by)
            VALUES (?, ?, ?)`,
            [req.params.id, `Priority set to ${priority}`, 'Admin']
            );

            res.json({message:"Priority updated"});
        }
    );

});

// ======================================================
// ADMIN ASSIGN OFFICER
// ======================================================

router.put('/assign-officer/:id', (req,res)=>{

    const { officer_id } = req.body;

    if(!officer_id){
        return res.status(400).json({error:"Officer required"});
    }

    db.query(
    `UPDATE complaints SET officer_id=? WHERE complaint_id=?`,
    [officer_id, req.params.id],
    (err,result)=>{

        if(err) return res.status(500).json({error:err.message});

        db.query(
        `INSERT INTO complaint_logs (complaint_id, action, performed_by)
         VALUES (?, ?, ?)`,
        [req.params.id, 'Officer Assigned', 'Admin']
        );

        res.json({message:"Officer assigned successfully"});
    });

});


// ======================================================
// EDIT COMPLAINT (USER)
// Only description & category
// ======================================================
router.put('/edit/:id', (req, res) => {

    const { description, category_id } = req.body;

    if (!description || !category_id) {
        return res.status(400).json({ error: "All fields required." });
    }

    const query = `
        UPDATE complaints 
        SET description = ?, category_id = ?
        WHERE complaint_id = ?
        AND status = 'Open'
    `;

    db.query(query,
        [description, category_id, req.params.id],
        (err, result) => {

            if (err) return res.status(500).json({ error: err.message });

            if (result.affectedRows === 0) {
                return res.status(400).json({ error: "Cannot edit. Already processed." });
            }

            db.query(
            `INSERT INTO complaint_logs (complaint_id, action, performed_by)
            VALUES (?, ?, ?)`,
            [req.params.id, 'Complaint Edited', 'User']
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

// ======================================================
// USER DELETE COMPLAINT
// ======================================================

router.delete('/delete/:id', (req,res)=>{

    const complaintId = req.params.id;

    // allow delete only if complaint is still open
    db.query(
    "SELECT status FROM complaints WHERE complaint_id=?",
    [complaintId],
    (err,result)=>{

        if(err) return res.status(500).json({error:err.message});

        if(result.length===0){
            return res.status(404).json({error:"Complaint not found"});
        }

        if(result[0].status !== "Open"){
            return res.status(400).json({error:"Only open complaints can be deleted"});
        }

        // delete evidence
        db.query(
        "DELETE FROM evidence WHERE complaint_id=?",
        [complaintId],
        ()=>{

            // delete logs
            db.query(
            "DELETE FROM complaint_logs WHERE complaint_id=?",
            [complaintId],
            ()=>{

                // delete complaint
                db.query(
                "DELETE FROM complaints WHERE complaint_id=?",
                [complaintId],
                (err2)=>{

                    if(err2) return res.status(500).json({error:err2.message});

                    res.json({message:"Complaint deleted successfully"});
                });

            });

        });

    });

});

// ======================================================
// CLOSED COMPLAINTS (ADMIN)
// ======================================================

// ======================================================
// CLOSED COMPLAINTS
// ======================================================

router.get('/closed', (req,res)=>{

const query = `
SELECT 
c.complaint_id,
u.full_name,
cat.category_name,
o.officer_name,
o.phone AS officer_phone,
c.description,
c.priority,
c.complaint_date,
e.file_path
FROM closed_complaints c
LEFT JOIN users u ON c.user_id = u.user_id
LEFT JOIN categories cat ON c.category_id = cat.category_id
LEFT JOIN officers o ON c.officer_id = o.officer_id
LEFT JOIN evidence e ON c.complaint_id = e.complaint_id
ORDER BY c.complaint_date DESC
`;

db.query(query,(err,result)=>{

if(err){
console.log(err);
return res.status(500).json({error:err.message});
}

res.json(result);

});

});

module.exports = router;