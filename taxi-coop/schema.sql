-- ============================================================
-- SISTEMA DE DESPACHO - COOPERATIVA DE TAXIS
-- PostgreSQL Schema v1.0
-- ============================================================

-- Extensión para UUIDs (opcional, usamos SERIAL por simplicidad)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLA: usuarios (operadoras y administradores)
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario    SERIAL PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    usuario       VARCHAR(50)  NOT NULL UNIQUE,
    password      VARCHAR(255) NOT NULL,
    rol           VARCHAR(20)  NOT NULL DEFAULT 'OPERADORA'
                  CHECK (rol IN ('ADMIN','OPERADORA','CONTABILIDAD')),
    estado        VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO'
                  CHECK (estado IN ('ACTIVO','INACTIVO')),
    fecha_creacion TIMESTAMP   DEFAULT NOW(),
    ultimo_login  TIMESTAMP
);

-- ============================================================
-- TABLA: socios (propietarios de taxis)
-- ============================================================
CREATE TABLE IF NOT EXISTS socios (
    id_socio      SERIAL PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    cedula        VARCHAR(20)  NOT NULL UNIQUE,
    telefono      VARCHAR(20),
    direccion     TEXT,
    fecha_ingreso DATE         DEFAULT CURRENT_DATE,
    estado        VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO'
                  CHECK (estado IN ('ACTIVO','INACTIVO'))
);

-- ============================================================
-- TABLA: concesionarios (cooperativas externas)
-- ============================================================
CREATE TABLE IF NOT EXISTS concesionarios (
    id_concesionario SERIAL PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    cooperativa      VARCHAR(100),
    cedula           VARCHAR(20)  UNIQUE,
    telefono         VARCHAR(20),
    estado           VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO'
                     CHECK (estado IN ('ACTIVO','INACTIVO'))
);

-- ============================================================
-- TABLA: conductores (todos los choferes)
-- ============================================================
CREATE TABLE IF NOT EXISTS conductores (
    id_conductor    SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    cedula          VARCHAR(20)  NOT NULL UNIQUE,
    telefono        VARCHAR(20),
    whatsapp        VARCHAR(20),
    tipo_conductor  VARCHAR(20)  NOT NULL
                    CHECK (tipo_conductor IN ('SOCIO','COLABORADOR','CONCESIONARIO')),
    id_socio        INT REFERENCES socios(id_socio) ON DELETE SET NULL,
    id_concesionario INT REFERENCES concesionarios(id_concesionario) ON DELETE SET NULL,
    estado          VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO'
                    CHECK (estado IN ('ACTIVO','INACTIVO','SUSPENDIDO'))
);

-- ============================================================
-- TABLA: unidades (taxis)
-- ============================================================
CREATE TABLE IF NOT EXISTS unidades (
    id_unidad       SERIAL PRIMARY KEY,
    numero_unidad   VARCHAR(10)  NOT NULL UNIQUE,
    placa           VARCHAR(20)  NOT NULL UNIQUE,
    id_socio        INT REFERENCES socios(id_socio) ON DELETE SET NULL,
    id_concesionario INT REFERENCES concesionarios(id_concesionario) ON DELETE SET NULL,
    tipo_unidad     VARCHAR(20)  NOT NULL DEFAULT 'SOCIO'
                    CHECK (tipo_unidad IN ('SOCIO','CONCESIONARIO')),
    estado          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO'
                    CHECK (estado IN ('ACTIVO','SUSPENDIDO','FUERA_SERVICIO')),
    fecha_registro  DATE         DEFAULT CURRENT_DATE
);

-- ============================================================
-- TABLA: unidad_conductor (asignación chofer-taxi)
-- ============================================================
CREATE TABLE IF NOT EXISTS unidad_conductor (
    id              SERIAL PRIMARY KEY,
    id_unidad       INT NOT NULL REFERENCES unidades(id_unidad) ON DELETE CASCADE,
    id_conductor    INT NOT NULL REFERENCES conductores(id_conductor) ON DELETE CASCADE,
    fecha_inicio    DATE DEFAULT CURRENT_DATE,
    fecha_fin       DATE,
    estado          VARCHAR(10) DEFAULT 'ACTIVO'
                    CHECK (estado IN ('ACTIVO','INACTIVO'))
);

-- ============================================================
-- TABLA: clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
    id_cliente          SERIAL PRIMARY KEY,
    nombre              VARCHAR(100),
    telefono            VARCHAR(20) NOT NULL,
    direccion_frecuente TEXT,
    referencia          TEXT,
    fecha_registro      TIMESTAMP DEFAULT NOW(),
    estado              VARCHAR(10) DEFAULT 'ACTIVO'
                        CHECK (estado IN ('ACTIVO','BLOQUEADO'))
);

-- ============================================================
-- TABLA: servicios (viajes) - tabla más importante
-- ============================================================
CREATE TABLE IF NOT EXISTS servicios (
    id_servicio         SERIAL PRIMARY KEY,
    id_cliente          INT REFERENCES clientes(id_cliente) ON DELETE SET NULL,
    telefono_cliente    VARCHAR(20) NOT NULL,
    direccion           TEXT NOT NULL,
    referencia          TEXT,
    id_unidad           INT REFERENCES unidades(id_unidad) ON DELETE SET NULL,
    id_conductor        INT REFERENCES conductores(id_conductor) ON DELETE SET NULL,
    estado_servicio     VARCHAR(20) NOT NULL DEFAULT 'CREADO'
                        CHECK (estado_servicio IN (
                            'CREADO','ASIGNADO','REASIGNADO',
                            'REALIZADO','CANCELADO','PERDIDO'
                        )),
    hora_creacion       TIMESTAMP DEFAULT NOW(),
    hora_asignacion     TIMESTAMP,
    hora_finalizacion   TIMESTAMP,
    id_operadora        INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    observaciones       TEXT
);

-- ============================================================
-- TABLA: historial_servicio (eventos de cada viaje)
-- ============================================================
CREATE TABLE IF NOT EXISTS historial_servicio (
    id              SERIAL PRIMARY KEY,
    id_servicio     INT NOT NULL REFERENCES servicios(id_servicio) ON DELETE CASCADE,
    evento          VARCHAR(50) NOT NULL,
    descripcion     TEXT,
    fecha           TIMESTAMP DEFAULT NOW(),
    id_usuario      INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

-- ============================================================
-- TABLA: ingreso_unidades (F4 - reporta entrada al turno)
-- ============================================================
CREATE TABLE IF NOT EXISTS ingreso_unidades (
    id              SERIAL PRIMARY KEY,
    id_unidad       INT NOT NULL REFERENCES unidades(id_unidad) ON DELETE CASCADE,
    id_conductor    INT REFERENCES conductores(id_conductor) ON DELETE SET NULL,
    hora_ingreso    TIMESTAMP DEFAULT NOW(),
    hora_salida     TIMESTAMP,
    viajes_realizados INT DEFAULT 0,
    estado          VARCHAR(10) DEFAULT 'ACTIVO'
                    CHECK (estado IN ('ACTIVO','CERRADO'))
);

-- ============================================================
-- TABLA: tiempo_aire (F2 - reporte de disponibilidad)
-- ============================================================
CREATE TABLE IF NOT EXISTS tiempo_aire (
    id              SERIAL PRIMARY KEY,
    id_unidad       INT NOT NULL REFERENCES unidades(id_unidad) ON DELETE CASCADE,
    minutos         INT DEFAULT 0,
    hora_reporte    TIMESTAMP DEFAULT NOW(),
    id_operadora    INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

-- ============================================================
-- TABLA: paradas
-- ============================================================
CREATE TABLE IF NOT EXISTS paradas (
    id_parada   SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    ubicacion   TEXT,
    estado      VARCHAR(10) DEFAULT 'ACTIVO'
                CHECK (estado IN ('ACTIVO','INACTIVO'))
);

-- ============================================================
-- TABLA: pagos (mensualidades de unidades)
-- ============================================================
CREATE TABLE IF NOT EXISTS pagos (
    id_pago         SERIAL PRIMARY KEY,
    id_unidad       INT NOT NULL REFERENCES unidades(id_unidad) ON DELETE CASCADE,
    mes             INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    anio            INT NOT NULL,
    valor           NUMERIC(10,2) NOT NULL DEFAULT 0,
    estado_pago     VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado_pago IN ('PAGADO','PENDIENTE','ATRASADO')),
    fecha_pago      TIMESTAMP,
    tipo_pago       VARCHAR(20) DEFAULT 'EFECTIVO'
                    CHECK (tipo_pago IN ('EFECTIVO','TRANSFERENCIA','OTRO')),
    id_usuario      INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    UNIQUE(id_unidad, mes, anio)
);

-- ============================================================
-- TABLA: bitacora (log del sistema)
-- ============================================================
CREATE TABLE IF NOT EXISTS bitacora (
    id              SERIAL PRIMARY KEY,
    tipo_evento     VARCHAR(50) NOT NULL,
    descripcion     TEXT,
    fecha           TIMESTAMP DEFAULT NOW(),
    id_usuario      INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    ip_origen       VARCHAR(45)
);

-- ============================================================
-- TABLA: estadisticas_diarias (cache de reportes)
-- ============================================================
CREATE TABLE IF NOT EXISTS estadisticas_diarias (
    fecha                   DATE PRIMARY KEY,
    servicios_realizados    INT DEFAULT 0,
    servicios_cancelados    INT DEFAULT 0,
    servicios_perdidos      INT DEFAULT 0,
    servicios_reasignados   INT DEFAULT 0,
    unidades_activas        INT DEFAULT 0
);

-- ============================================================
-- TABLA: prioridad_unidades (ranking automático)
-- ============================================================
CREATE TABLE IF NOT EXISTS prioridad_unidades (
    id_unidad       INT PRIMARY KEY REFERENCES unidades(id_unidad) ON DELETE CASCADE,
    viajes_hoy      INT DEFAULT 0,
    tiempo_aire     INT DEFAULT 0,
    hora_ultimo_viaje TIMESTAMP,
    prioridad       INT DEFAULT 0,
    actualizado     TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES para optimizar consultas frecuentes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_servicios_estado    ON servicios(estado_servicio);
CREATE INDEX IF NOT EXISTS idx_servicios_fecha     ON servicios(hora_creacion);
CREATE INDEX IF NOT EXISTS idx_servicios_telefono  ON servicios(telefono_cliente);
CREATE INDEX IF NOT EXISTS idx_ingreso_estado      ON ingreso_unidades(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_estado        ON pagos(estado_pago);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha      ON bitacora(fecha);

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Usuario administrador (password: admin123 - CAMBIAR EN PRODUCCIÓN)
INSERT INTO usuarios (nombre, usuario, password, rol) VALUES
('Administrador', 'admin', '$2b$10$rOzpCq.7X1N.P4g4wHpLKuTHDzGwFzKQAv7v0LNqM5qZhK2.3GYHS', 'ADMIN')
ON CONFLICT (usuario) DO NOTHING;

-- Paradas iniciales
INSERT INTO paradas (nombre, ubicacion) VALUES
('Parada Central', 'Centro de la ciudad'),
('Parada Norte',   'Sector Norte'),
('Parada Sur',     'Sector Sur'),
('Parada Este',    'Sector Este')
ON CONFLICT DO NOTHING;

-- ============================================================
-- FIN DEL SCHEMA
-- ============================================================
