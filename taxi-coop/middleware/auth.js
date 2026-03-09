const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, usuario) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido o expirado' });
        }
        req.usuario = usuario;
        next();
    });
};

const soloAdmin = (req, res, next) => {
    if (req.usuario.rol !== 'ADMIN') {
        return res.status(403).json({ error: 'Acceso solo para administradores' });
    }
    next();
};

module.exports = { verificarToken, soloAdmin };
