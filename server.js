const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let jugadores = {};
let propiedades = {}; // NUEVO: Aquí guardaremos quién es dueño de qué
const colores = ['#FF5733', '#33FF57', '#3357FF', '#F1C40F', '#9B59B6', '#E67E22'];
let colorIndex = 0;

io.on('connection', (socket) => {
    console.log('Nuevo dispositivo: ' + socket.id);

    socket.on('unirseAlJuego', (nombre) => {
        jugadores[socket.id] = {
            id: socket.id,
            nombre: nombre,
            dinero: 1500,
            posicion: 0,
            color: colores[colorIndex % colores.length]
        };
        colorIndex++;
        io.emit('actualizarJugadores', jugadores);
        io.emit('actualizarPropiedades', propiedades); // Avisa de los dueños actuales
    });

    socket.on('tirarDado', () => {
        const jugador = jugadores[socket.id];
        if (!jugador) return;

        const dado1 = Math.floor(Math.random() * 6) + 1;
        const dado2 = Math.floor(Math.random() * 6) + 1;
        const totalDado = dado1 + dado2;

        jugador.posicion += totalDado;

        if (jugador.posicion >= 40) {
            jugador.posicion -= 40;
            jugador.dinero += 200;
        }

        io.emit('resultadoDado', { nombre: jugador.nombre, dado: totalDado, dado1, dado2 });
        io.emit('actualizarJugadores', jugadores);

        // NUEVO: Verificamos si la casilla está libre
        if (jugador.posicion !== 0 && !propiedades[jugador.posicion]) {
            // Le mandamos la opción de compra SOLO al jugador que tiró
            io.to(socket.id).emit('preguntarCompra', jugador.posicion);
        }
    });

    // NUEVO: Cuando el jugador le da clic al botón de "Comprar"
    socket.on('comprarPropiedad', (datos) => {
        const jugador = jugadores[socket.id];
        if (jugador && jugador.dinero >= datos.precio) {
            jugador.dinero -= datos.precio; // Le cobramos
            propiedades[datos.casilla] = {
                dueno: socket.id,
                colorDueno: jugador.color
            };
            io.emit('actualizarJugadores', jugadores);
            io.emit('actualizarPropiedades', propiedades); // Pintamos el tablero para todos
        }
    });

    socket.on('disconnect', () => {
        delete jugadores[socket.id];
        io.emit('actualizarJugadores', jugadores);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));