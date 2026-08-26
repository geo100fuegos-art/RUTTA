CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'CLIENTE'
        CHECK (rol IN ('CLIENTE', 'PROFESIONAL', 'ADMINISTRACION')),
    telefono VARCHAR(40),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solicitudes_de_servicio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES usuarios(id),
    titulo VARCHAR(160) NOT NULL,
    descripcion TEXT NOT NULL,
    categoria VARCHAR(80) NOT NULL,
    ubicacion VARCHAR(160),
    presupuesto NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (presupuesto >= 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
        CHECK (estado IN ('ABIERTO', 'COTIZADO', 'ACEPTADO', 'CANCELADO')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cotizaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id UUID NOT NULL REFERENCES solicitudes_de_servicio(id) ON DELETE CASCADE,
    profesional_id UUID NOT NULL REFERENCES usuarios(id),
    cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    mensaje TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (solicitud_id, profesional_id)
);

CREATE TABLE IF NOT EXISTS operaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id UUID NOT NULL REFERENCES solicitudes_de_servicio(id),
    cotizacion_id UUID NOT NULL REFERENCES cotizaciones(id),
    cliente_id UUID NOT NULL REFERENCES usuarios(id),
    profesional_id UUID NOT NULL REFERENCES usuarios(id),
    cantidad_total NUMERIC(12,2) NOT NULL CHECK (cantidad_total > 0),
    tasa_comision NUMERIC(5,4) NOT NULL DEFAULT 0.1500,
    importe_comision NUMERIC(12,2) NOT NULL,
    cantidad_profesional NUMERIC(12,2) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADO'
        CHECK (estado IN ('CONFIRMADO', 'EN CURSO', 'TERMINADO', 'CANCELADO')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completado_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS solicitudes_cliente_idx
    ON solicitudes_de_servicio(cliente_id);

CREATE INDEX IF NOT EXISTS cotizaciones_solicitud_idx
    ON cotizaciones(solicitud_id);

CREATE INDEX IF NOT EXISTS cotizaciones_profesional_idx
    ON cotizaciones(profesional_id);

CREATE INDEX IF NOT EXISTS operaciones_cliente_idx
    ON operaciones(cliente_id);

CREATE INDEX IF NOT EXISTS operaciones_profesional_idx
    ON operaciones(profesional_id);
