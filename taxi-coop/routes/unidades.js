const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');

router.use(verificarToken);

// ========== SOCIOS ==========

router.get('/socios', async (req, res) => {
    const result = await pool.query('SELECT * FROM socios ORDER BY nombre');
    res.json(result.rows);
});

router.post('/socios', async (req, res) => {
    const { nombre, cedula, telefono, direccion } = req.body;
    try {
        const r = await pool.query(
            'INSERT INTO socios (nombre, cedula, telefono, direccion) VALUES ($1,$2,$3,$4) RETURNING *',
            [nombre, cedula, telefono, direccion]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Cédula ya registrada' });
        res.status(500).json({ error: err.message });
    }
});

router.put('/socios/:id', async (req, res) => {
    const { nombre, cedula, telefono, direccion, estado } = req.body;
    const r = await pool.query(
        'UPDATE socios SET nombre=$1, cedula=$2, telefono=$3, direccion=$4, estado=$5 WHERE id_socio=$6 RETURNING *',
        [nombre, cedula, telefono, direccion, estado, req.params.id]
    );
    res.json(r.rows[0]);
});

// ========== CONDUCTORES ==========

router.get('/conductores', async (req, res) => {
    const result = await pool.query(`
        SELECT c.*, s.nombre as nombre_socio 
        FROM conductores c 
        LEFT JOIN socios s ON c.id_socio = s.id_socio 
        ORDER BY c.nombre
    `);
    res.json(result.rows);
});

router.post('/conductores', async (req, res) => {
    const { nombre, cedula, telefono, whatsapp, tipo_conductor, id_socio, id_concesionario } = req.body;
    try {
        const r = await pool.query(
            'INSERT INTO conductores (nombre, cedula, telefono, whatsapp, tipo_conductor, id_socio, id_concesionario) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [nombre, cedula, telefono, whatsapp, tipo_conductor, id_socio || null, id_concesionario || null]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Cédula ya registrada' });
        res.status(500).json({ error: err.message });
    }
});

router.put('/conductores/:id', async (req, res) => {
    const { nombre, cedula, telefono, whatsapp, tipo_conductor, estado } = req.body;
    const r = await pool.query(
        'UPDATE conductores SET nombre=$1, cedula=$2, telefono=$3, whatsapp=$4, tipo_conductor=$5, estado=$6 WHERE id_conductor=$7 RETURNING *',
        [nombre, cedula, telefono, whatsapp, tipo_conductor, estado, req.params.id]
    );
    res.json(r.rows[0]);
});

// ========== UNIDADES ==========

router.get('/unidades', async (req, res) => {
    const result = await pool.query(`
        SELECT u.*, 
               s.nombre as nombre_socio,
               con.nombre as nombre_concesionario,
               iu.estado as estado_turno,
               iu.id as id_ingreso,
               c.nombre as conductor_actual,
               c.id_conductor
        FROM unidades u
        LEFT JOIN socios s ON u.id_socio = s.id_socio
        LEFT JOIN concesionarios con ON u.id_concesionario = con.id_concesionario
        LEFT JOIN ingreso_unidades iu ON iu.id_unidad = u.id_unidad AND iu.estado = 'ACTIVO'
        LEFT JOIN unidad_conductor uc ON uc.id_unidad = u.id_unidad AND uc.estado = 'ACTIVO'
        LEFT JOIN conductores c ON uc.id_conductor = c.id_conductor
        ORDER BY u.numero_unidad
    `);
    res.json(result.rows);
});

router.get('/unidades/activas', async (req, res) => {
    const result = await pool.query(`
        SELECT u.id_unidad, u.numero_unidad, u.placa, u.tipo_unidad,
               c.nombre as conductor, c.id_conductor,
               iu.hora_ingreso, iu.viajes_realizados,
               p.viajes_hoy, p.prioridad
        FROM ingreso_unidades iu
        JOIN unidades u ON iu.id_unidad = u.id_unidad
        LEFT JOIN conductores c ON iu.id_conductor = c.id_conductor
        LEFT JOIN prioridad_unidades p ON p.id_unidad = u.id_unidad
        WHERE iu.estado = 'ACTIVO' AND u.estado = 'ACTIVO'
        ORDER BY p.prioridad ASC, iu.hora_ingreso ASC
    `);
    res.json(result.rows);
});

router.post('/unidades', async (req, res) => {
    const { numero_unidad, placa, id_socio, id_concesionario, tipo_unidad } = req.body;
    try {
        const r = await pool.query(
            'INSERT INTO unidades (numero_unidad, placa, id_socio, id_concesionario, tipo_unidad) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [numero_unidad, placa, id_socio || null, id_concesionario || null, tipo_unidad]
        );
        // Inicializar prioridad
        await pool.query(
            'INSERT INTO prioridad_unidades (id_unidad) VALUES ($1) ON CONFLICT DO NOTHING',
            [r.rows[0].id_unidad]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Número o placa ya registrada' });
        res.status(500).json({ error: err.message });
    }
});

router.put('/unidades/:id', async (req, res) => {
    const { numero_unidad, placa, estado } = req.body;
    const r = await pool.query(
        'UPDATE unidades SET numero_unidad=$1, placa=$2, estado=$3 WHERE id_unidad=$4 RETURNING *',
        [numero_unidad, placa, estado, req.params.id]
    );
    res.json(r.rows[0]);
});

// ========== F4: INGRESO/SALIDA DE TURNO ==========

router.post('/unidades/:id/ingresar', async (req, res) => {
    const { id_conductor } = req.body;
    try {
        // Verificar si ya está activa
        const activa = await pool.query(
            'SELECT id FROM ingreso_unidades WHERE id_unidad=$1 AND estado=$2',
            [req.params.id, 'ACTIVO']
        );
        if (activa.rows.length > 0) {
            return res.status(400).json({ error: 'La unidad ya está activa en turno' });
        }
        const r = await pool.query(
            'INSERT INTO ingreso_unidades (id_unidad, id_conductor) VALUES ($1,$2) RETURNING *',
            [req.params.id, id_conductor || null]
        );
        await pool.query(
            'INSERT INTO prioridad_unidades (id_unidad, hora_ultimo_viaje) VALUES ($1, NOW()) ON CONFLICT (id_unidad) DO UPDATE SET viajes_hoy=0, tiempo_aire=0, prioridad=0, hora_ultimo_viaje=NOW()',
            [req.params.id]
        );
        await pool.query(
            'INSERT INTO bitacora (tipo_evento, descripcion, id_usuario) VALUES ($1,$2,$3)',
            ['F4_INGRESO', `Unidad ${req.params.id} ingresó a turno`, req.usuario.id]
        );
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/unidades/:id/salir', async (req, res) => {
    const r = await pool.query(
        'UPDATE ingreso_unidades SET estado=$1, hora_salida=NOW() WHERE id_unidad=$2 AND estado=$3 RETURNING *',
        ['CERRADO', req.params.id, 'ACTIVO']
    );
    if (r.rows.length === 0) return res.status(400).json({ error: 'Unidad no está activa' });
    await pool.query(
        'INSERT INTO bitacora (tipo_evento, descripcion, id_usuario) VALUES ($1,$2,$3)',
        ['F4_SALIDA', `Unidad ${req.params.id} salió de turno`, req.usuario.id]
    );
    res.json(r.rows[0]);
});

// ========== F2: TIEMPO AIRE ==========

router.post('/unidades/:id/tiempo-aire', async (req, res) => {
    const { minutos } = req.body;
    await pool.query(
        'INSERT INTO tiempo_aire (id_unidad, minutos, id_operadora) VALUES ($1,$2,$3)',
        [req.params.id, minutos || 0, req.usuario.id]
    );
    // Actualizar prioridad
    await pool.query(
        'UPDATE prioridad_unidades SET tiempo_aire = tiempo_aire + $1, prioridad = prioridad - 1, actualizado=NOW() WHERE id_unidad=$2',
        [minutos || 0, req.params.id]
    );
    res.json({ mensaje: 'Tiempo aire registrado' });
});

// ========== CONCESIONARIOS ==========

router.get('/concesionarios', async (req, res) => {
    const r = await pool.query('SELECT * FROM concesionarios ORDER BY nombre');
    res.json(r.rows);
});

router.post('/concesionarios', async (req, res) => {
    const { nombre, cooperativa, cedula, telefono } = req.body;
    const r = await pool.query(
        'INSERT INTO concesionarios (nombre, cooperativa, cedula, telefono) VALUES ($1,$2,$3,$4) RETURNING *',
        [nombre, cooperativa, cedula, telefono]
    );
    res.status(201).json(r.rows[0]);
});

module.exports = router;
