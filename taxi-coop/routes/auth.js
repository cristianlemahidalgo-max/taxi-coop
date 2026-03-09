const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    try {
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE usuario = $1 AND estado = $2',
            [usuario, 'ACTIVO']
        );
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        const user = result.rows[0];
        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        // Actualizar último login
        await pool.query(
            'UPDATE usuarios SET ultimo_login = NOW() WHERE id_usuario = $1',
            [user.id_usuario]
        );
        // Generar token
        const token = jwt.sign(
            { id: user.id_usuario, usuario: user.usuario, rol: user.rol, nombre: user.nombre },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );
        // Registrar en bitácora
        await pool.query(
            'INSERT INTO bitacora (tipo_evento, descripcion, id_usuario) VALUES ($1, $2, $3)',
            ['LOGIN', `Login de ${user.nombre}`, user.id_usuario]
        );
        res.json({ token, usuario: { nombre: user.nombre, rol: user.rol, id: user.id_usuario } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/auth/me
router.get('/me', verificarToken, (req, res) => {
    res.json(req.usuario);
});

// POST /api/auth/usuarios (solo admin)
router.post('/usuarios', verificarToken, soloAdmin, async (req, res) => {
    const { nombre, usuario, password, rol } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO usuarios (nombre, usuario, password, rol) VALUES ($1,$2,$3,$4) RETURNING id_usuario, nombre, usuario, rol',
            [nombre, usuario, hash, rol]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Usuario ya existe' });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/auth/usuarios (solo admin)
router.get('/usuarios', verificarToken, soloAdmin, async (req, res) => {
    const result = await pool.query(
        'SELECT id_usuario, nombre, usuario, rol, estado, fecha_creacion, ultimo_login FROM usuarios ORDER BY nombre'
    );
    res.json(result.rows);
});

// PUT /api/auth/cambiar-password
router.put('/cambiar-password', verificarToken, async (req, res) => {
    const { password_actual, password_nuevo } = req.body;
    try {
        const result = await pool.query('SELECT * FROM usuarios WHERE id_usuario = $1', [req.usuario.id]);
        const user = result.rows[0];
        const valid = await bcrypt.compare(password_actual, user.password);
        if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
        const hash = await bcrypt.hash(password_nuevo, 10);
        await pool.query('UPDATE usuarios SET password = $1 WHERE id_usuario = $2', [hash, req.usuario.id]);
        res.json({ mensaje: 'Contraseña actualizada' });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
