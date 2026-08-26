const fs = require("fs");
const path = require("path");
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.15);

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  throw new Error("Faltan DATABASE_URL o JWT_SECRET en las variables de entorno.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

const schemaPath = path.join(__dirname, "schema.sql");
const schemaSQL = fs.readFileSync(schemaPath, "utf8");

app.use(helmet());
app.use(express.json({ limit: "100kb" }));

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(express.static(path.join(__dirname, "public")));

function clean(value) {
  return String(value || "").trim();
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Token requerido",
    });
  }

  const token = header.substring(7);

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: "Token inválido o expirado",
    });
  }
}

app.get("/api/salud", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      app: "RUTTA",
      database: "connected",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app: "RUTTA",
      database: "error",
      error: error.message,
    });
  }
});

app.get("/api", (req, res) => {
  res.json({
    ok: true,
    app: "RUTTA",
    message: "API funcionando correctamente",
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const role = clean(req.body.role || "CLIENTE").toUpperCase();
    const phone = clean(req.body.phone);

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Nombre, email y contraseña son obligatorios.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "La contraseña debe tener al menos 6 caracteres.",
      });
    }

    const allowedRoles = ["CLIENTE", "PROFESIONAL"];

   if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        error: "Rol inválido.",
      });
    }

    const existing = await pool.query(
      "SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "El email ya está registrado.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO usuarios
        (nombre, EMAIL, hash_de_contrasena, rol, telefono)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id, nombre, email, rol, telefono
      `,
      [name, email, passwordHash, role, phone || null]
    );

    const user = result.rows[0];

    res.status(201).json({
      ok: true,
      user,
      token: createToken(user),
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      error: "No se pudo crear el usuario.",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");

    const result = await pool.query(
      `
      SELECT id, nombre, email, hash_de_contrasena, rol, telefono
      FROM usuarios
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "email o contraseña incorrectos.",
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.hash_de_contrasena
    );

    if (!valid) {
      return res.status(401).json({
        error: "email o contraseña incorrectos.",
      });
    }

    delete user.hash_de_contrasena;

    res.json({
      ok: true,
      user,
      token: createToken(user),
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      error: "No se pudo iniciar sesión.",
    });
  }
});

app.get("/api/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, nombre, email, rol, telefono, creado_en
      FROM usuarios
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Usuario no encontrado.",
      });
    }

    res.json({
      ok: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("ME ERROR:", error);

    res.status(500).json({
      error: "No se pudo obtener el usuario.",
    });
  }
});

app.get("/{*splat}", (req, res) => {
  const indexPath = path.join(__dirname, "public", "index.html");

  if (fs.existsSync(indexPath)) {
   return res.sendFile(indexPath);
  }

  res.json({
    ok: true,
    app: "RUTTA",
    message: "Servidor funcionando.",
  });
});

async function start() {
  try {
    await pool.query(schemaSQL);

    console.log("Base de datos preparada correctamente.");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`RUTTA funcionando en el puerto ${PORT}`);
    });
  } catch (error) {
    console.error("ERROR INICIANDO RUTTA:", error);
    process.exit(1);
  }
}

start();
