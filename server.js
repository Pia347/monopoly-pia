const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let jugadores = {};
let propiedades = {}; // Aquí guardamos quién es dueño de qué
const colores = ['#FF5733', '#33FF57', '#3357FF', '#F1C40F', '#9B59B6', '#E67E22'];
let colorIndex = 0;

io.on('connection', (socket) => {
    console.log('Nuevo dispositivo: ' + socket.id);

    // 1. Cuando un jugador entra, empieza con 0 vueltas
    socket.on('unirseAlJuego', (nombre) => {
        jugadores[socket.id] = {
            id: socket.id,
            nombre: nombre,
            dinero: 1500,
            posicion: 0,
            color: colores[colorIndex % colores.length],
            vueltas: 0 // <-- El contador de vueltas inicia en 0
        };
        colorIndex++;
        io.emit('actualizarJugadores', jugadores);
        io.emit('actualizarPropiedades', propiedades);
    });

    // 2. Lógica al tirar el dado
    socket.on('tirarDado', () => {
        const jugador = jugadores[socket.id];
        if (!jugador) return;

        const dado1 = Math.floor(Math.random() * 6) + 1;
        const dado2 = Math.floor(Math.random() * 6) + 1;
        const totalDado = dado1 + dado2;

        jugador.posicion += totalDado;

        // Si pasa por la salida (casilla 40 o más)
        if (jugador.posicion >= 40) {
            jugador.posicion -= 40;
            jugador.dinero += 200;
            jugador.vueltas++; // <-- Le sumamos una vuelta completada
        }

        io.emit('resultadoDado', { nombre: jugador.nombre, dado: totalDado, dado1, dado2 });
        io.emit('actualizarJugadores', jugadores);

        // 3. SOLO le preguntamos si quiere comprar si ya dio al menos 1 vuelta (vueltas > 0)
        if (jugador.posicion !== 0 && !propiedades[jugador.posicion] && jugador.vueltas > 0) {
            io.to(socket.id).emit('preguntarCompra', jugador.posicion);
        }
    });

    // Cuando el jugador confirma la compra
    socket.on('comprarPropiedad', (datos) => {
        const jugador = jugadores[socket.id];
        if (jugador && jugador.dinero >= datos.precio) {
            jugador.dinero -= datos.precio; // Le cobramos
            propiedades[datos.casilla] = {
                dueno: socket.id,
                colorDueno: jugador.color
            };
            io.emit('actualizarJugadores', jugadores);
            io.emit('actualizarPropiedades', propiedades); // Actualizamos colores en el tablero
        }
    });

    socket.on('disconnect', () => {
        delete jugadores[socket.id];
        io.emit('actualizarJugadores', jugadores);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));