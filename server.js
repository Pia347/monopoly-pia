const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Estado del juego (La memoria del servidor)
let jugadores = {};
// Colores para diferenciar a los jugadores en pantalla
const colores = ['#FF5733', '#33FF57', '#3357FF', '#F1C40F', '#9B59B6', '#E67E22'];
let colorIndex = 0;

io.on('connection', (socket) => {
    console.log('Nuevo dispositivo conectado: ' + socket.id);

    // 1. Cuando un jugador pone su nombre para unirse
    socket.on('unirseAlJuego', (nombre) => {
        jugadores[socket.id] = {
            id: socket.id,
            nombre: nombre,
            dinero: 1500, // Dinero inicial del Monopoly
            posicion: 0,  // Casillas de la 0 a la 39
            color: colores[colorIndex % colores.length]
        };
        colorIndex++;
        
        // Le avisamos a todos que las estadísticas cambiaron
        io.emit('actualizarJugadores', jugadores);
    });

    // 2. Cuando tiran los dados (Ahora son 2 dados)
    socket.on('tirarDado', () => {
        const jugador = jugadores[socket.id];
        if (!jugador) return; // Si el jugador no ha puesto su nombre, ignoramos el clic

        const dado1 = Math.floor(Math.random() * 6) + 1;
        const dado2 = Math.floor(Math.random() * 6) + 1;
        const totalDado = dado1 + dado2;

        // Movemos al jugador
        jugador.posicion += totalDado;

        // Si su posición pasa de 39, dio una vuelta al tablero
        if (jugador.posicion >= 40) {
            jugador.posicion -= 40; // Reiniciamos su posición
            jugador.dinero += 200;  // Bono clásico de Monopoly por pasar GO
        }

        // Enviamos el historial del dado
        io.emit('resultadoDado', { 
            nombre: jugador.nombre, 
            dado: totalDado,
            dado1: dado1,
            dado2: dado2
        });
        
        // Actualizamos el tablero de posiciones para todos
        io.emit('actualizarJugadores', jugadores);
    });

    // 3. Cuando alguien cierra la pestaña
    socket.on('disconnect', () => {
        delete jugadores[socket.id]; // Lo borramos de la partida
        io.emit('actualizarJugadores', jugadores);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});