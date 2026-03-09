require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARES
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// RUTAS API
// ============================================================
app.use('/api/auth',    require('./routes/auth'));
app.use('/api',         require('./routes/unidades'));
app.use('/api',         require('./routes/servicios'));

// ============================================================
// RUTA RAÍZ → Panel web
// ============================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// ARRANCAR SERVIDOR
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ Sistema de Despacho corriendo en puerto ${PORT}`);
    console.log(`📡 API disponible en http://localhost:${PORT}/api`);
});
