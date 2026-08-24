const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server); // Aquí nace el tiempo real

app.use(express.static('public'));

// Esto escucha cuando alguien entra a la página
io.on('connection', (socket) => {
    console.log('Un jugador se ha conectado. ID: ' + socket.id);

    // Escuchar cuando este jugador específico haga clic en "tirarDado"
    socket.on('tirarDado', () => {
        // Generar un número del 1 al 6
        const resultado = Math.floor(Math.random() * 6) + 1;
        
        // io.emit envía el mensaje a TODOS los jugadores conectados al mismo tiempo
        io.emit('resultadoDado', { 
            jugador: socket.id.substring(0, 4), // Tomamos solo 4 letras de su ID para que sea corto
            numero: resultado 
        });
    });

    // Escuchar cuando el jugador cierra la pestaña
    socket.on('disconnect', () => {
        console.log('Jugador desconectado: ' + socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});