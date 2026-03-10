require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { pool } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

async function inicializarDB() {
    console.log('🔧 Inicializando base de datos...');
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id_usuario SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
                usuario VARCHAR(50) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL,
                rol VARCHAR(20) NOT NULL DEFAULT 'OPERADORA' CHECK (rol IN ('ADMIN','OPERADORA','CONTABILIDAD')),
                estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
                fecha_creacion TIMESTAMP DEFAULT NOW(), ultimo_login TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS socios (
                id_socio SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
                cedula VARCHAR(20) NOT NULL UNIQUE, telefono VARCHAR(20), direccion TEXT,
                fecha_ingreso DATE DEFAULT CURRENT_DATE,
                estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO'))
            );
            CREATE TABLE IF NOT EXISTS concesionarios (
                id_concesionario SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
                cooperativa VARCHAR(100), cedula VARCHAR(20) UNIQUE, telefono VARCHAR(20),
                estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO'))
            );
            CREATE TABLE IF NOT EXISTS conductores (
                id_conductor SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
                cedula VARCHAR(20) NOT NULL UNIQUE, telefono VARCHAR(20), whatsapp VARCHAR(20),
                tipo_conductor VARCHAR(20) NOT NULL CHECK (tipo_conductor IN ('SOCIO','COLABORADOR','CONCESIONARIO')),
                id_socio INT REFERENCES socios(id_socio) ON DELETE SET NULL,
                id_concesionario INT REFERENCES concesionarios(id_concesionario) ON DELETE SET NULL,
                estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO','SUSPENDIDO'))
            );
            CREATE TABLE IF NOT EXISTS unidades (
                id_unidad SERIAL PRIMARY KEY, numero_unidad VARCHAR(10) NOT NULL UNIQUE,
                placa VARCHAR(20) NOT NULL UNIQUE,
                id_socio INT REFERENCES socios(id_socio) ON DELETE SET NULL,
                id_concesionario INT REFERENCES concesionarios(id_concesionario) ON DELETE SET NULL,
                tipo_unidad VARCHAR(20) NOT NULL DEFAULT 'SOCIO' CHECK (tipo_unidad IN ('SOCIO','CONCESIONARIO')),
                estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','SUSPENDIDO','FUERA_SERVICIO')),
                fecha_registro DATE DEFAULT CURRENT_DATE
            );
            CREATE TABLE IF NOT EXISTS unidad_conductor (
                id SERIAL PRIMARY KEY,
                id_unidad INT NOT NULL REFERENCES unidades(id_unidad) ON DELETE CASCADE,
                id_conductor INT NOT NULL REFERENCES conductores(id_conductor) ON DELETE CASCADE,
                fecha_inicio DATE DEFAULT CURRENT_DATE, fecha_fin DATE,
                estado VARCHAR(10) DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO'))
            );
            CREATE TABLE IF NOT EXISTS clientes (
                id_cliente SERIAL PRIMARY KEY, nombre VARCHAR(100),
                telefono VARCHAR(20) NOT NULL, direccion_frecuente TEXT, referencia TEXT,
                fecha_registro TIMESTAMP DEFAULT NOW(),
                estado VARCHAR(10) DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','BLOQUEADO'))
            );
            CREATE TABLE IF NOT EXISTS servicios (
                id_servicio SERIAL PRIMARY KEY,
                id_cliente INT REFERENCES clientes(id_cliente) ON DELETE SET NULL,
                telefono_cliente VARCHAR(20) NOT NULL, direccion TEXT NOT NULL, referencia TEXT,
                id_unidad INT REFERENCES unidades(id_unidad) ON DELETE SET NULL,
                id_conductor INT REFERENCES conductores(id_conductor) ON DELETE SET NULL,
                estado_servicio VARCHAR(20) NOT NULL DEFAULT 'CREADO'
                    CHECK (estado_servicio IN ('CREADO','ASIGNADO','REASIGNADO','REALIZADO','CANCELADO','PERDIDO')),
                hora_creacion TIMESTAMP DEFAULT NOW(), hora_asignacion TIMESTAMP,
                hora_finalizacion TIMESTAMP,
                id_operadora INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
                observaciones TEXT
            );
            CREATE TABLE IF NOT EXISTS historial_servicio (
                id SERIAL PRIMARY KEY,
                id_servicio INT NOT NULL REFERENCES servicios(id_servicio) ON DELETE CASCADE,
                evento VARCHAR(50) NOT NULL, descripcion TEXT, fecha TIMESTAMP DEFAULT NOW(),
                id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS ingreso_unidades (
                id SERIAL PRIMARY KEY,
                id_unidad INT NOT NULL REFERENCES unidades(id_unidad) ON DELETE CASCADE,
                id_conductor INT REFERENCES conductores(id_conductor) ON DELETE SET NULL,
                hora_ingreso TIMESTAMP DEFAULT NOW(), hora_salida TIMESTAMP,
                viajes_realizados INT DEFAULT 0,
                estado VARCHAR(10) DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','CERRADO'))
            );
            CREATE TABLE IF NOT EXISTS tiempo_aire (
                id SERIAL PRIMARY KEY,
                id_unidad INT NOT NULL REFERENCES unidades(id_unidad) ON DELETE CASCADE,
                minutos INT DEFAULT 0, hora_reporte TIMESTAMP DEFAULT NOW(),
                id_operadora INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS paradas (
                id_parada SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
                ubicacion TEXT, estado VARCHAR(10) DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO'))
            );
            CREATE TABLE IF NOT EXISTS pagos (
                id_pago SERIAL PRIMARY KEY,
                id_unidad INT NOT NULL REFERENCES unidades(id_unidad) ON DELETE CASCADE,
                mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12), anio INT NOT NULL,
                valor NUMERIC(10,2) NOT NULL DEFAULT 0,
                estado_pago VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_pago IN ('PAGADO','PENDIENTE','ATRASADO')),
                fecha_pago TIMESTAMP, tipo_pago VARCHAR(20) DEFAULT 'EFECTIVO'
                    CHECK (tipo_pago IN ('EFECTIVO','TRANSFERENCIA','OTRO')),
                id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
                UNIQUE(id_unidad, mes, anio)
            );
            CREATE TABLE IF NOT EXISTS bitacora (
                id SERIAL PRIMARY KEY, tipo_evento VARCHAR(50) NOT NULL,
                descripcion TEXT, fecha TIMESTAMP DEFAULT NOW(),
                id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
                ip_origen VARCHAR(45)
            );
            CREATE TABLE IF NOT EXISTS estadisticas_diarias (
                fecha DATE PRIMARY KEY, servicios_realizados INT DEFAULT 0,
                servicios_cancelados INT DEFAULT 0, servicios_perdidos INT DEFAULT 0,
                servicios_reasignados INT DEFAULT 0, unidades_activas INT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS prioridad_unidades (
                id_unidad INT PRIMARY KEY REFERENCES unidades(id_unidad) ON DELETE CASCADE,
                viajes_hoy INT DEFAULT 0, tiempo_aire INT DEFAULT 0,
                hora_ultimo_viaje TIMESTAMP, prioridad INT DEFAULT 0,
                actualizado TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_servicios_estado   ON servicios(estado_servicio);
            CREATE INDEX IF NOT EXISTS idx_servicios_fecha    ON servicios(hora_creacion);
            CREATE INDEX IF NOT EXISTS idx_ingreso_estado     ON ingreso_unidades(estado);
        `);

        // Usuario admin
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('admin123', 10);
        await pool.query(`
            INSERT INTO usuarios (nombre, usuario, password, rol)
            VALUES ('Administrador', 'admin', $1, 'ADMIN')
            ON CONFLICT (usuario) DO NOTHING
        `, [hash]);

        // Paradas
        await pool.query(`
            INSERT INTO paradas (nombre) VALUES ('Parada Central'),('Parada Norte'),('Parada Sur'),('Parada Este')
            ON CONFLICT DO NOTHING
        `);

        console.log('✅ Base de datos lista');
    } catch (err) {
        console.error('❌ Error DB:', err.message);
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', require('./routes/auth'));
app.use('/api',      require('./routes/unidades'));
app.use('/api',      require('./routes/servicios'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

inicializarDB().then(() => {
    app.listen(PORT, () => console.log(`🚕 Sistema corriendo en puerto ${PORT}`));
});
