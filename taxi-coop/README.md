# 🚕 Sistema de Despacho — CoopTaxi

Sistema completo de despacho para cooperativas de taxis.  
Backend: **Node.js + Express** · Base de datos: **PostgreSQL** · Deploy: **Railway**

---

## 📦 Estructura del proyecto

```
taxi-coop/
├── server.js          ← Servidor principal
├── db.js              ← Conexión PostgreSQL
├── schema.sql         ← Script de la base de datos
├── package.json
├── .env.example       ← Copia esto como .env
├── middleware/
│   └── auth.js        ← Autenticación JWT
├── routes/
│   ├── auth.js        ← Login / usuarios
│   ├── unidades.js    ← Socios, conductores, unidades, F4/F2
│   └── servicios.js   ← Servicios, clientes, pagos, estadísticas
└── public/
    └── index.html     ← Panel web de la operadora
```

---

## 🚀 DESPLIEGUE EN RAILWAY (paso a paso)

### 1. Crear cuenta en Railway
Ve a https://railway.app y crea una cuenta gratuita.

### 2. Nuevo proyecto → PostgreSQL
- Clic en **"New Project"**
- Selecciona **"Add PostgreSQL"**
- Railway crea la base de datos automáticamente

### 3. Ejecutar el schema SQL
- En Railway, abre tu base de datos PostgreSQL
- Ve a la pestaña **"Data"** o **"Query"**
- Copia y pega todo el contenido de `schema.sql`
- Ejecuta el script

### 4. Subir el código
**Opción A — GitHub (recomendada):**
```bash
git init
git add .
git commit -m "Sistema de despacho CoopTaxi"
git remote add origin https://github.com/tu-usuario/taxi-coop.git
git push -u origin main
```
Luego en Railway: **"New Service" → "GitHub Repo"** → selecciona tu repo.

**Opción B — Railway CLI:**
```bash
npm install -g @railway/cli
railway login
railway link
railway up
```

### 5. Configurar variables de entorno
En Railway, ve a tu servicio → **"Variables"** → agrega:
```
DATABASE_URL = (Railway lo agrega automáticamente si conectas el PostgreSQL)
JWT_SECRET   = unaClaveSecretaMuyLargaYSegura2024
NODE_ENV     = production
```

### 6. ¡Listo!
Railway te dará una URL tipo: `https://taxi-coop-production.up.railway.app`

---

## 💻 DESARROLLO LOCAL

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env con tu DATABASE_URL local

# 3. Ejecutar schema en tu PostgreSQL local
psql -U postgres -d tu_base_de_datos -f schema.sql

# 4. Iniciar servidor
npm run dev
# Servidor en http://localhost:3000
```

---

## 🔐 Acceso inicial

| Usuario | Contraseña | Rol   |
|---------|-----------|-------|
| admin   | admin123  | ADMIN |

> **⚠️ IMPORTANTE:** Cambia la contraseña del admin después del primer login.

---

## 📡 API Endpoints

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET  | `/api/auth/me` | Usuario actual |
| POST | `/api/auth/usuarios` | Crear usuario (solo ADMIN) |

### Unidades
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/unidades` | Todas las unidades |
| GET  | `/api/unidades/activas` | Unidades en turno |
| POST | `/api/unidades` | Registrar unidad |
| POST | `/api/unidades/:id/ingresar` | F4 - Ingresar turno |
| POST | `/api/unidades/:id/salir` | F4 - Salir del turno |
| POST | `/api/unidades/:id/tiempo-aire` | F2 - Tiempo aire |

### Servicios
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/servicios` | Historial (con filtros) |
| GET  | `/api/servicios/pendientes` | Servicios activos |
| POST | `/api/servicios` | Crear servicio |
| PUT  | `/api/servicios/:id/asignar` | Asignar unidad |
| PUT  | `/api/servicios/:id/estado` | Finalizar/cancelar |

### Otros
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/api/socios` | Socios |
| GET/POST | `/api/conductores` | Conductores |
| GET/POST | `/api/pagos` | Pagos |
| GET | `/api/estadisticas/hoy` | Dashboard |

---

## 🛠 Tecnologías

- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL
- **Auth:** JWT (JSON Web Tokens)
- **Frontend:** HTML + CSS + JS vanilla (sin frameworks)
- **Deploy:** Railway / Render

---

## 📈 Próximas mejoras sugeridas

- [ ] App móvil para conductores (React Native)
- [ ] Notificaciones WhatsApp (Twilio / Meta API)
- [ ] Reporte PDF mensual de pagos
- [ ] Mapa en tiempo real de unidades (Google Maps API)
- [ ] Chat interno operadoras
