const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let jugadores = {};
let propiedades = {}; 
const colores = ['#FF5733', '#33FF57', '#3357FF', '#F1C40F', '#9B59B6', '#E67E22'];
let colorIndex = 0;

// CONTROL DE TURNOS
let ordenJugadores = []; 
let turnoActual = 0; 

io.on('connection', (socket) => {
    console.log('Nuevo dispositivo: ' + socket.id);

    socket.on('unirseAlJuego', (nombre) => {
        jugadores[socket.id] = {
            id: socket.id,
            nombre: nombre,
            dinero: 1500,
            posicion: 0,
            color: colores[colorIndex % colores.length],
            vueltas: 0,
            yaConstruyo: false,
            yaTiro: false // Nuevo candado para el dado
        };
        colorIndex++;
        
        // Agregamos al jugador a la fila de turnos
        ordenJugadores.push(socket.id); 

        io.emit('actualizarJugadores', jugadores);
        io.emit('actualizarPropiedades', propiedades);
        io.emit('actualizarTurno', ordenJugadores[turnoActual]); // Avisa de quién es el turno
    });

    socket.on('tirarDado', () => {
        // Bloqueo estricto: Si no es su turno, o si ya tiró, el servidor ignora la petición
        if (ordenJugadores[turnoActual] !== socket.id) return;
        
        const jugador = jugadores[socket.id];
        if (!jugador || jugador.yaTiro) return;

        jugador.yaTiro = true; // Cerramos el candado del dado
        jugador.yaConstruyo = false; // Abrimos el candado de construcción

        const dado1 = Math.floor(Math.random() * 6) + 1;
        const dado2 = Math.floor(Math.random() * 6) + 1;
        const totalDado = dado1 + dado2;

        jugador.posicion += totalDado;

        if (jugador.posicion >= 40) {
            jugador.posicion -= 40;
            jugador.dinero += 200;
            jugador.vueltas++;
        }

        io.emit('resultadoDado', { nombre: jugador.nombre, dado: totalDado, dado1, dado2 });
        io.emit('actualizarJugadores', jugadores);

        if (jugador.posicion !== 0) {
            const propiedad = propiedades[jugador.posicion];
            
            if (propiedad) {
                if (propiedad.dueno !== socket.id) {
                    let alquiler = propiedad.hotel ? propiedad.rentas[5] : propiedad.rentas[propiedad.casas];
                    jugador.dinero -= alquiler;
                    if (jugadores[propiedad.dueno]) jugadores[propiedad.dueno].dinero += alquiler;
                    
                    io.emit('pagoAlquiler', {
                        pagador: jugador.nombre,
                        cobrador: jugadores[propiedad.dueno] ? jugadores[propiedad.dueno].nombre : 'el banco',
                        monto: alquiler
                    });
                    io.emit('actualizarJugadores', jugadores);
                } else {
                    if (!propiedad.hotel && !jugador.yaConstruyo) {
                        io.to(socket.id).emit('preguntarConstruccion', jugador.posicion);
                    }
                }
            } else if (jugador.vueltas > 0) {
                io.to(socket.id).emit('preguntarCompra', jugador.posicion);
            }
        }
    });

    socket.on('comprarPropiedad', (datos) => {
        const jugador = jugadores[socket.id];
        if (jugador && jugador.dinero >= datos.precio) {
            jugador.dinero -= datos.precio;
            propiedades[datos.casilla] = {
                dueno: socket.id,
                colorDueno: jugador.color,
                precioBase: datos.precio,
                rentas: datos.rentas,
                casas: 0,
                hotel: false
            };
            jugador.yaConstruyo = true; 
            io.emit('actualizarJugadores', jugadores);
            io.emit('actualizarPropiedades', propiedades);
        }
    });

    socket.on('comprarCasa', (casillaIndex) => {
        const jugador = jugadores[socket.id];
        const propiedad = propiedades[casillaIndex];
        
        if (propiedad && propiedad.dueno === socket.id && jugador.posicion === casillaIndex && !jugador.yaConstruyo) {
            const costoMejora = Math.floor(propiedad.precioBase * 0.5); 
            if (jugador.dinero >= costoMejora) {
                if (propiedad.casas < 4 && !propiedad.hotel) {
                    propiedad.casas++;
                    jugador.dinero -= costoMejora;
                } else if (propiedad.casas === 4 && !propiedad.hotel) {
                    propiedad.casas = 0;
                    propiedad.hotel = true;
                    jugador.dinero -= costoMejora;
                }
                jugador.yaConstruyo = true; 
                io.emit('actualizarJugadores', jugadores);
                io.emit('actualizarPropiedades', propiedades);
            }
        }
    });

    // NUEVA FUNCIÓN: Pasar al siguiente jugador
    socket.on('terminarTurno', () => {
        if (ordenJugadores[turnoActual] === socket.id) {
            const jugador = jugadores[socket.id];
            if (jugador) {
                jugador.yaTiro = false; // Reseteamos sus candados para su próxima ronda
                jugador.yaConstruyo = false;
            }
            
            turnoActual++;
            if (turnoActual >= ordenJugadores.length) turnoActual = 0;
            
            io.emit('actualizarTurno', ordenJugadores[turnoActual]);
        }
    });

    socket.on('disconnect', () => {
        // Sacarlo de la fila de turnos
        const index = ordenJugadores.indexOf(socket.id);
        if (index !== -1) {
            ordenJugadores.splice(index, 1);
            if (turnoActual >= ordenJugadores.length) turnoActual = 0;
            if (ordenJugadores.length > 0) {
                io.emit('actualizarTurno', ordenJugadores[turnoActual]);
            }
        }
        
        delete jugadores[socket.id];
        io.emit('actualizarJugadores', jugadores);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));