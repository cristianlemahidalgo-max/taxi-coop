const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');

router.use(verificarToken);

// ========== CLIENTES ==========

router.get('/clientes/buscar', async (req, res) => {
    const { telefono } = req.query;
    const r = await pool.query(
        'SELECT * FROM clientes WHERE telefono ILIKE $1 LIMIT 5',
        [`%${telefono}%`]
    );
    res.json(r.rows);
});

router.post('/clientes', async (req, res) => {
    const { nombre, telefono, direccion_frecuente, referencia } = req.body;
    try {
        const r = await pool.query(
            `INSERT INTO clientes (nombre, telefono, direccion_frecuente, referencia)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [nombre || null, telefono, direccion_frecuente || null, referencia || null]
        );
        res.status(201).json(r.rows[0] || { mensaje: 'Cliente ya existe' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== SERVICIOS (VIAJES) ==========

// Crear nuevo servicio
router.post('/servicios', async (req, res) => {
    const { telefono_cliente, direccion, referencia, id_cliente } = req.body;
    try {
        const r = await pool.query(
            `INSERT INTO servicios (telefono_cliente, direccion, referencia, id_cliente, id_operadora, estado_servicio)
             VALUES ($1, $2, $3, $4, $5, 'CREADO') RETURNING *`,
            [telefono_cliente, direccion, referencia || null, id_cliente || null, req.usuario.id]
        );
        const servicio = r.rows[0];
        // Historial
        await pool.query(
            'INSERT INTO historial_servicio (id_servicio, evento, descripcion, id_usuario) VALUES ($1,$2,$3,$4)',
            [servicio.id_servicio, 'CREADO', `Servicio creado - ${direccion}`, req.usuario.id]
        );
        res.status(201).json(servicio);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Asignar unidad a servicio
router.put('/servicios/:id/asignar', async (req, res) => {
    const { id_unidad, id_conductor } = req.body;
    try {
        // Verificar si ya tenía una unidad (reasignación)
        const actual = await pool.query('SELECT estado_servicio, id_unidad FROM servicios WHERE id_servicio=$1', [req.params.id]);
        if (actual.rows.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });

        const wasAsignado = actual.rows[0].estado_servicio === 'ASIGNADO' || actual.rows[0].id_unidad;
        const nuevoEstado = wasAsignado ? 'REASIGNADO' : 'ASIGNADO';

        const r = await pool.query(
            `UPDATE servicios 
             SET id_unidad=$1, id_conductor=$2, estado_servicio=$3, hora_asignacion=NOW()
             WHERE id_servicio=$4 RETURNING *`,
            [id_unidad, id_conductor || null, nuevoEstado, req.params.id]
        );

        // Actualizar prioridad de la unidad
        await pool.query(
            `UPDATE prioridad_unidades 
             SET viajes_hoy = viajes_hoy + 1, prioridad = prioridad + 5, hora_ultimo_viaje=NOW(), actualizado=NOW()
             WHERE id_unidad=$1`,
            [id_unidad]
        );

        // Actualizar viajes del ingreso activo
        await pool.query(
            'UPDATE ingreso_unidades SET viajes_realizados = viajes_realizados + 1 WHERE id_unidad=$1 AND estado=$2',
            [id_unidad, 'ACTIVO']
        );

        await pool.query(
            'INSERT INTO historial_servicio (id_servicio, evento, descripcion, id_usuario) VALUES ($1,$2,$3,$4)',
            [req.params.id, nuevoEstado, `Unidad asignada: ${id_unidad}`, req.usuario.id]
        );

        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Finalizar / cancelar / perdido
router.put('/servicios/:id/estado', async (req, res) => {
    const { estado, observaciones } = req.body;
    const estadosValidos = ['REALIZADO', 'CANCELADO', 'PERDIDO'];
    if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    const r = await pool.query(
        `UPDATE servicios SET estado_servicio=$1, hora_finalizacion=NOW(), observaciones=$2
         WHERE id_servicio=$3 RETURNING *`,
        [estado, observaciones || null, req.params.id]
    );

    // Actualizar estadísticas del día
    const hoy = new Date().toISOString().split('T')[0];
    const campo = estado === 'REALIZADO' ? 'servicios_realizados'
        : estado === 'CANCELADO' ? 'servicios_cancelados' : 'servicios_perdidos';
    await pool.query(
        `INSERT INTO estadisticas_diarias (fecha, ${campo}) VALUES ($1, 1)
         ON CONFLICT (fecha) DO UPDATE SET ${campo} = estadisticas_diarias.${campo} + 1`,
        [hoy]
    );

    await pool.query(
        'INSERT INTO historial_servicio (id_servicio, evento, descripcion, id_usuario) VALUES ($1,$2,$3,$4)',
        [req.params.id, estado, observaciones || estado, req.usuario.id]
    );

    res.json(r.rows[0]);
});

// Obtener servicios del día con filtros
router.get('/servicios', async (req, res) => {
    const { fecha, estado, limit = 100 } = req.query;
    const fechaFiltro = fecha || new Date().toISOString().split('T')[0];
    try {
        let query = `
            SELECT s.*, 
                   c.nombre as cliente_nombre,
                   u.numero_unidad,
                   u.placa,
                   con.nombre as conductor_nombre,
                   us.nombre as operadora_nombre
            FROM servicios s
            LEFT JOIN clientes c ON s.id_cliente = c.id_cliente
            LEFT JOIN unidades u ON s.id_unidad = u.id_unidad
            LEFT JOIN conductores con ON s.id_conductor = con.id_conductor
            LEFT JOIN usuarios us ON s.id_operadora = us.id_usuario
            WHERE DATE(s.hora_creacion) = $1
        `;
        const params = [fechaFiltro];
        if (estado) {
            query += ` AND s.estado_servicio = $2`;
            params.push(estado);
        }
        query += ` ORDER BY s.hora_creacion DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const r = await pool.query(query, params);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Servicios pendientes (en tiempo real para la operadora)
router.get('/servicios/pendientes', async (req, res) => {
    const r = await pool.query(`
        SELECT s.*, 
               c.nombre as cliente_nombre,
               u.numero_unidad,
               con.nombre as conductor_nombre
        FROM servicios s
        LEFT JOIN clientes c ON s.id_cliente = c.id_cliente
        LEFT JOIN unidades u ON s.id_unidad = u.id_unidad
        LEFT JOIN conductores con ON s.id_conductor = con.id_conductor
        WHERE s.estado_servicio IN ('CREADO','ASIGNADO','REASIGNADO')
        ORDER BY s.hora_creacion ASC
    `);
    res.json(r.rows);
});

// Historial de un servicio
router.get('/servicios/:id/historial', async (req, res) => {
    const r = await pool.query(
        `SELECT h.*, u.nombre as usuario_nombre 
         FROM historial_servicio h
         LEFT JOIN usuarios u ON h.id_usuario = u.id_usuario
         WHERE h.id_servicio = $1 ORDER BY h.fecha ASC`,
        [req.params.id]
    );
    res.json(r.rows);
});

// ========== PAGOS ==========

router.get('/pagos', async (req, res) => {
    const { mes, anio } = req.query;
    const r = await pool.query(`
        SELECT p.*, u.numero_unidad, u.placa, s.nombre as socio_nombre
        FROM pagos p
        JOIN unidades u ON p.id_unidad = u.id_unidad
        LEFT JOIN socios s ON u.id_socio = s.id_socio
        WHERE p.mes = $1 AND p.anio = $2
        ORDER BY u.numero_unidad
    `, [mes || new Date().getMonth() + 1, anio || new Date().getFullYear()]);
    res.json(r.rows);
});

router.post('/pagos', async (req, res) => {
    const { id_unidad, mes, anio, valor, tipo_pago } = req.body;
    try {
        const r = await pool.query(
            `INSERT INTO pagos (id_unidad, mes, anio, valor, estado_pago, fecha_pago, tipo_pago, id_usuario)
             VALUES ($1,$2,$3,$4,'PAGADO',NOW(),$5,$6)
             ON CONFLICT (id_unidad, mes, anio) 
             DO UPDATE SET estado_pago='PAGADO', valor=$4, fecha_pago=NOW(), tipo_pago=$5
             RETURNING *`,
            [id_unidad, mes, anio, valor, tipo_pago || 'EFECTIVO', req.usuario.id]
        );
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ESTADÍSTICAS / DASHBOARD ==========

router.get('/estadisticas/hoy', async (req, res) => {
    const hoy = new Date().toISOString().split('T')[0];
    const [stats, unidadesActivas, serviciosPendientes] = await Promise.all([
        pool.query('SELECT * FROM estadisticas_diarias WHERE fecha = $1', [hoy]),
        pool.query("SELECT COUNT(*) as total FROM ingreso_unidades WHERE estado = 'ACTIVO'"),
        pool.query("SELECT COUNT(*) as total FROM servicios WHERE estado_servicio IN ('CREADO','ASIGNADO') AND DATE(hora_creacion)=$1", [hoy])
    ]);
    res.json({
        fecha: hoy,
        estadisticas: stats.rows[0] || { servicios_realizados: 0, servicios_cancelados: 0, servicios_perdidos: 0 },
        unidades_activas: parseInt(unidadesActivas.rows[0].total),
        servicios_pendientes: parseInt(serviciosPendientes.rows[0].total)
    });
});

// ========== PARADAS ==========

router.get('/paradas', async (req, res) => {
    const r = await pool.query("SELECT * FROM paradas WHERE estado='ACTIVO' ORDER BY nombre");
    res.json(r.rows);
});

module.exports = router;
