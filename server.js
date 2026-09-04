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
            yaTiro: false,
            // NUEVO: Variables para la cárcel
            enCarcel: false,
            turnosCarcel: 0 
        };
        colorIndex++;
        ordenJugadores.push(socket.id); 

        io.emit('actualizarJugadores', jugadores);
        io.emit('actualizarPropiedades', propiedades);
        io.emit('actualizarTurno', ordenJugadores[turnoActual]);
    });

    // NUEVA FUNCIÓN: Pagar Fianza ANTES de tirar
    socket.on('pagarFianza', () => {
        if (ordenJugadores[turnoActual] !== socket.id) return;
        const jugador = jugadores[socket.id];
        
        if (jugador && jugador.enCarcel && jugador.dinero >= 50 && !jugador.yaTiro) {
            jugador.dinero -= 50;
            jugador.enCarcel = false;
            jugador.turnosCarcel = 0;
            io.emit('alertaGlobal', `💸 ${jugador.nombre} pagó $50 de fianza y ya es libre.`);
            io.emit('actualizarJugadores', jugadores);
        }
    });

    socket.on('tirarDado', () => {
        if (ordenJugadores[turnoActual] !== socket.id) return;
        const jugador = jugadores[socket.id];
        if (!jugador || jugador.yaTiro) return;

        jugador.yaTiro = true; 
        jugador.yaConstruyo = false;

        const dado1 = Math.floor(Math.random() * 6) + 1;
        const dado2 = Math.floor(Math.random() * 6) + 1;
        const totalDado = dado1 + dado2;

        let seMovio = false;

        // LÓGICA DE LA CÁRCEL
        if (jugador.enCarcel) {
            if (dado1 === dado2) {
                jugador.enCarcel = false;
                jugador.turnosCarcel = 0;
                jugador.posicion += totalDado;
                seMovio = true;
                io.emit('alertaGlobal', `🎲 ¡${jugador.nombre} sacó dobles (${dado1}-${dado2}) y escapa de la cárcel!`);
            } else {
                jugador.turnosCarcel++;
                if (jugador.turnosCarcel >= 3) {
                    // Al 3er turno se le cobra obligatorio y sale
                    jugador.dinero -= 50;
                    jugador.enCarcel = false;
                    jugador.turnosCarcel = 0;
                    jugador.posicion += totalDado;
                    seMovio = true;
                    io.emit('alertaGlobal', `👮 ${jugador.nombre} pagó $50 obligatorios por límite de turnos y sale de la cárcel.`);
                } else {
                    io.emit('alertaGlobal', `🔒 ${jugador.nombre} sacó ${dado1}-${dado2} y sigue en la cárcel.`);
                    io.emit('resultadoDado', { nombre: jugador.nombre, dado: totalDado, dado1, dado2 });
                    io.emit('actualizarJugadores', jugadores);
                    return; // Termina su turno sin moverse
                }
            }
        } else {
            jugador.posicion += totalDado;
            seMovio = true;
        }

        // Si se movió (normal o escapó)
        if (seMovio) {
            if (jugador.posicion >= 40) {
                jugador.posicion -= 40;
                jugador.dinero += 200;
                jugador.vueltas++;
            }

            // REGLA: Casilla 30 te manda directo a la cárcel
            if (jugador.posicion === 30) {
                jugador.posicion = 10;
                jugador.enCarcel = true;
                jugador.turnosCarcel = 0;
                io.emit('alertaGlobal', `🚓 ¡${jugador.nombre} ha caído en la Policía y se va a la CÁRCEL!`);
                seMovio = false; // Ya no cobra rentas ni compra nada
            }
        }

        io.emit('resultadoDado', { nombre: jugador.nombre, dado: totalDado, dado1, dado2 });
        io.emit('actualizarJugadores', jugadores);

        // Lógica de casillas (Solo si no está en la cárcel ni en "solo visitas")
        if (seMovio && jugador.posicion !== 0 && jugador.posicion !== 10 && jugador.posicion !== 30) {
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
                dueno: socket.id, colorDueno: jugador.color, precioBase: datos.precio, rentas: datos.rentas, casas: 0, hotel: false
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
                    propiedad.casas++; jugador.dinero -= costoMejora;
                } else if (propiedad.casas === 4 && !propiedad.hotel) {
                    propiedad.casas = 0; propiedad.hotel = true; jugador.dinero -= costoMejora;
                }
                jugador.yaConstruyo = true; 
                io.emit('actualizarJugadores', jugadores);
                io.emit('actualizarPropiedades', propiedades);
            }
        }
    });

    socket.on('terminarTurno', () => {
        if (ordenJugadores[turnoActual] === socket.id) {
            const jugador = jugadores[socket.id];
            if (jugador) {
                jugador.yaTiro = false;
                jugador.yaConstruyo = false;
            }
            turnoActual++;
            if (turnoActual >= ordenJugadores.length) turnoActual = 0;
            io.emit('actualizarTurno', ordenJugadores[turnoActual]);
        }
    });

    socket.on('disconnect', () => {
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