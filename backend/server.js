require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 5000;

// PostgreSQL Connection Pool
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Middleware
app.use(cors());
app.use(express.json());



// JWT Secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('JWT_SECRET not defined in .env file!');
    process.exit(1);
}

// --- Middleware for JWT Authentication ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ message: "Authentication token required." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT Verification Error:', err);
            return res.status(403).json({ message: "Invalid or expired token." });
        }
        req.user = user; // Attach user payload (e.g., { id: user_id, username: '...' }) to request
        next();
    });
};
// --- End JWT Authentication Middleware ---

// --- Auth Routes ---

// Register User
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        // hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // insert the user
        const result = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
            [username, hashedPassword]
        );
        const user = result.rows[0];

        // 🔑 generate a JWT so the user is logged-in immediately
        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '1d', issuer: 'screenplay-app' }
        );

        // respond
        res.status(201).json({
            message: 'User registered successfully!',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (err) {
        if (err.code === '23505') { // unique-violation
            return res.status(409).json({ message: 'Username already exists.' });
        }
        console.error('Registration error:', err);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        // Generate JWT
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' }); // Token expires in 1 day

        res.status(200).json({ message: "Login successful!", token, user: { id: user.id, username: user.username } });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: "Server error during login." });
    }
});

// --- Screenplay Routes (Protected) ---

// Get Screenplays for authenticated user
app.get('/api/screenplays', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM screenplays WHERE user_id = $1 ORDER BY updated_at DESC',
            [req.user.id] // Use user ID from authenticated token
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching screenplays:', err);
        res.status(500).json({ message: "Server error" });
    }
});

// Get a single screenplay by ID for authenticated user
app.get('/api/screenplays/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM screenplays WHERE id = $1 AND user_id = $2',
            [id, req.user.id] // Ensure user owns the screenplay
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Screenplay not found or unauthorized access." });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching screenplay:', err);
        res.status(500).json({ message: "Server error" });
    }
});

// Create New Screenplay for authenticated user
app.post('/api/screenplays', authenticateToken, async (req, res) => {
    const { title, content } = req.body;

    // Content will now be a string, default to empty string
    const screenplayContent = content || '';

    try {
        const result = await pool.query(
            'INSERT INTO screenplays (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, title || 'New Screenplay', screenplayContent] // Default title to 'New Screenplay'
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating screenplay:', err);
        res.status(500).json({ message: "Server error" });
    }
});

// Update Screenplay for authenticated user
app.put('/api/screenplays/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body; // content will be a string
    try {
        const result = await pool.query(
            'UPDATE screenplays SET title = $1, content = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
            [title, content, id, req.user.id] // Ensure user owns the screenplay
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Screenplay not found or unauthorized." });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating screenplay:', err);
        res.status(500).json({ message: "Server error" });
    }
});

// Delete Screenplay for authenticated user
app.delete('/api/screenplays/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'DELETE FROM screenplays WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, req.user.id] // Ensure user owns the screenplay
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Screenplay not found or unauthorized." });
        }
        res.status(204).send(); // No Content
    } catch (err) {
        console.error('Error deleting screenplay:', err);
        res.status(500).json({ message: "Server error" });
    }
});

// PDF Generation
app.get('/api/screenplays/:id/pdf', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM screenplays WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Screenplay not found or unauthorized." });
        }
        const screenplay = result.rows[0];

        const doc = new PDFDocument();
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            let pdfBuffer = Buffer.concat(buffers);
            res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment;filename=${screenplay.title.replace(/\s/g, '_')}.pdf`
            }).end(pdfBuffer);
        });

        // Title Page
        doc.fontSize(28).text(screenplay.title, { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(12).text(`Written by: ${req.user.username}`, { align: 'center' });
        doc.addPage();

        // Content pages - now treating content as a plain string
        doc.fontSize(12).text(screenplay.content);

        doc.end();

    } catch (err) {
        console.error('Error generating PDF:', err);
        res.status(500).json({ message: "Server error during PDF generation." });
    }
});


// Server Listener
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});