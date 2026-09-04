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
let boteCentro = 0; 

// Baraja 1: Cofre CPN
const cartasCPN = [
    { texto: "¡Error a favor en el sistema de la Cooperativa! Recibes $200.", accion: "ganar", valor: 200 },
    { texto: "Pago de impuestos municipales en Santo Domingo. Paga $50 al centro.", accion: "pagar", valor: 50 },
    { texto: "Ventas excelentes en tu tienda esta semana. Recibes $100.", accion: "ganar", valor: 100 },
    { texto: "Gastos de trámites de titulación. Paga $100 al centro.", accion: "pagar", valor: 100 },
    { texto: "¡Ganas la lotería local! Recibes $150.", accion: "ganar", valor: 150 },
    { texto: "Exceso de velocidad. Multa de $20 al centro.", accion: "pagar", valor: 20 },
    { texto: "Ve directamente a la cárcel. No pases por SALIDA.", accion: "carcel", valor: 0 },
    { texto: "Avanza directamente hasta la SALIDA y cobra $200.", accion: "salida", valor: 0 }
];

// Baraja 2: Canales de Atención
const cartasCanales = [
    { texto: "Haces un pago rápido por la App Móvil y ganas un sorteo. Recibes $100.", accion: "ganar", valor: 100 },
    { texto: "Pides un duplicado de tarjeta en Ventanilla. Paga $20 al centro.", accion: "pagar", valor: 20 },
    { texto: "Actualizas tus datos en la sucursal virtual. Recibes $50 por la campaña.", accion: "ganar", valor: 50 },
    { texto: "Llamada larga al Call Center desde el celular. Paga $15 de saldo al centro.", accion: "pagar", valor: 15 },
    { texto: "Recibes una transferencia internacional por ventanilla. Recibes $150.", accion: "ganar", valor: 150 },
    { texto: "Cajero automático retenido por intento de fraude. Ve directamente a la cárcel.", accion: "carcel", valor: 0 },
    { texto: "Uso de cajero de otra red. Paga comisión de $30 al centro.", accion: "pagar", valor: 30 },
    { texto: "Campaña de ahorro programado. Avanza hasta la SALIDA y cobra $200.", accion: "salida", valor: 0 }
];

io.on('connection', (socket) => {
    console.log('Nuevo dispositivo: ' + socket.id);

    socket.on('unirseAlJuego', (nombre) => {
        jugadores[socket.id] = {
            id: socket.id, nombre: nombre, dinero: 1500, posicion: 0, 
            color: colores[colorIndex % colores.length],
            vueltas: 0, yaConstruyo: false, yaTiro: false, enCarcel: false, turnosCarcel: 0 
        };
        colorIndex++;
        ordenJugadores.push(socket.id); 

        io.emit('actualizarJugadores', jugadores);
        io.emit('actualizarPropiedades', propiedades);
        io.emit('actualizarTurno', ordenJugadores[turnoActual]);
        io.emit('actualizarBote', boteCentro); 
    });

    socket.on('pagarFianza', () => {
        if (ordenJugadores[turnoActual] !== socket.id) return;
        const jugador = jugadores[socket.id];
        
        if (jugador && jugador.enCarcel && jugador.dinero >= 50 && !jugador.yaTiro) {
            jugador.dinero -= 50;
            boteCentro += 50; 
            jugador.enCarcel = false;
            jugador.turnosCarcel = 0;
            io.emit('alertaGlobal', `💸 ${jugador.nombre} pagó $50 al centro de la mesa por su fianza.`);
            io.emit('actualizarJugadores', jugadores);
            io.emit('actualizarBote', boteCentro);
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

        if (jugador.enCarcel) {
            if (dado1 === dado2) {
                jugador.enCarcel = false; jugador.turnosCarcel = 0;
                jugador.posicion += totalDado; seMovio = true;
                io.emit('alertaGlobal', `🎲 ¡${jugador.nombre} sacó dobles y escapa de la cárcel!`);
            } else {
                jugador.turnosCarcel++;
                if (jugador.turnosCarcel >= 3) {
                    jugador.dinero -= 50; boteCentro += 50; 
                    jugador.enCarcel = false; jugador.turnosCarcel = 0;
                    jugador.posicion += totalDado; seMovio = true;
                    io.emit('alertaGlobal', `👮 ${jugador.nombre} pagó $50 obligatorios al centro y sale libre.`);
                    io.emit('actualizarBote', boteCentro);
                } else {
                    io.emit('alertaGlobal', `🔒 ${jugador.nombre} sacó ${dado1}-${dado2} y sigue en la cárcel.`);
                    io.emit('resultadoDado', { nombre: jugador.nombre, dado: totalDado, dado1, dado2 });
                    io.emit('actualizarJugadores', jugadores);
                    return; 
                }
            }
        } else {
            jugador.posicion += totalDado;
            seMovio = true;
        }

        if (seMovio) {
            if (jugador.posicion >= 40) {
                jugador.posicion -= 40;
                jugador.dinero += 200;
                jugador.vueltas++;
            }

            if (jugador.posicion === 30) {
                jugador.posicion = 10; jugador.enCarcel = true; jugador.turnosCarcel = 0;
                io.emit('alertaGlobal', `🚓 ¡${jugador.nombre} ha caído en la Policía y se va a la CÁRCEL!`);
                seMovio = false; 
            }
        }

        io.emit('resultadoDado', { nombre: jugador.nombre, dado: totalDado, dado1, dado2 });
        io.emit('actualizarJugadores', jugadores);

        if (seMovio && jugador.posicion !== 0 && jugador.posicion !== 10 && jugador.posicion !== 30) {
            
            // Lógica: PARADA LIBRE (Casilla 20)
            if (jugador.posicion === 20) {
                if (boteCentro > 0) {
                    io.emit('alertaGlobal', `🎉 ¡JACKPOT! ${jugador.nombre} cayó en Parada Libre y se llevó $${boteCentro} del centro.`);
                    jugador.dinero += boteCentro; boteCentro = 0;
                    io.emit('actualizarBote', boteCentro);
                    io.emit('actualizarJugadores', jugadores);
                }
                return; 
            }

            // NUEVO: Lógica de Impuestos (Casillas 4 y 38)
            if (jugador.posicion === 4 || jugador.posicion === 38) {
                jugador.dinero -= 200;
                boteCentro += 200;
                io.emit('alertaGlobal', `🧾 ¡Ouch! ${jugador.nombre} cayó en Impuestos y pagó $200 al centro de la mesa.`);
                io.emit('actualizarBote', boteCentro);
                io.emit('actualizarJugadores', jugadores);
                return; 
            }

            // Lógica: COFRE CPN
            if (jugador.posicion === 2 || jugador.posicion === 17 || jugador.posicion === 33) {
                const carta = cartasCPN[Math.floor(Math.random() * cartasCPN.length)];
                aplicarCarta(carta, jugador);
                io.emit('mostrarCartaCPN', { jugador: jugador.nombre, carta: carta.texto });
                io.emit('actualizarJugadores', jugadores);
                return; 
            }

            // Lógica: CANALES DE ATENCIÓN
            if (jugador.posicion === 7 || jugador.posicion === 22 || jugador.posicion === 36) {
                const carta = cartasCanales[Math.floor(Math.random() * cartasCanales.length)];
                aplicarCarta(carta, jugador);
                io.emit('mostrarCartaCanales', { jugador: jugador.nombre, carta: carta.texto });
                io.emit('actualizarJugadores', jugadores);
                return; 
            }

            const propiedad = propiedades[jugador.posicion];
            if (propiedad) {
                if (propiedad.dueno !== socket.id) {
                    let alquiler = propiedad.hotel ? propiedad.rentas[5] : propiedad.rentas[propiedad.casas];
                    jugador.dinero -= alquiler;
                    if (jugadores[propiedad.dueno]) jugadores[propiedad.dueno].dinero += alquiler;
                    io.emit('pagoAlquiler', { pagador: jugador.nombre, cobrador: jugadores[propiedad.dueno] ? jugadores[propiedad.dueno].nombre : 'el banco', monto: alquiler });
                    io.emit('actualizarJugadores', jugadores);
                } else {
                    if (!propiedad.hotel && !jugador.yaConstruyo) { io.to(socket.id).emit('preguntarConstruccion', jugador.posicion); }
                }
            } else if (jugador.vueltas > 0) {
                io.to(socket.id).emit('preguntarCompra', jugador.posicion);
            }
        }
    });

    function aplicarCarta(carta, jugador) {
        if (carta.accion === "ganar") {
            jugador.dinero += carta.valor;
        } else if (carta.accion === "pagar") {
            jugador.dinero -= carta.valor;
            boteCentro += carta.valor;
            io.emit('actualizarBote', boteCentro);
        } else if (carta.accion === "carcel") {
            jugador.posicion = 10;
            jugador.enCarcel = true;
            jugador.turnosCarcel = 0;
        } else if (carta.accion === "salida") {
            jugador.posicion = 0;
            jugador.dinero += 200;
            jugador.vueltas++;
        }
    }

    socket.on('comprarPropiedad', (datos) => {
        const jugador = jugadores[socket.id];
        if (jugador && jugador.dinero >= datos.precio) {
            jugador.dinero -= datos.precio;
            propiedades[datos.casilla] = { dueno: socket.id, colorDueno: jugador.color, precioBase: datos.precio, rentas: datos.rentas, casas: 0, hotel: false };
            jugador.yaConstruyo = true; 
            io.emit('actualizarJugadores', jugadores); io.emit('actualizarPropiedades', propiedades);
        }
    });

    socket.on('comprarCasa', (casillaIndex) => {
        const jugador = jugadores[socket.id];
        const propiedad = propiedades[casillaIndex];
        if (propiedad && propiedad.dueno === socket.id && jugador.posicion === casillaIndex && !jugador.yaConstruyo) {
            const costoMejora = Math.floor(propiedad.precioBase * 0.5); 
            if (jugador.dinero >= costoMejora) {
                if (propiedad.casas < 4 && !propiedad.hotel) { propiedad.casas++; jugador.dinero -= costoMejora; } 
                else if (propiedad.casas === 4 && !propiedad.hotel) { propiedad.casas = 0; propiedad.hotel = true; jugador.dinero -= costoMejora; }
                jugador.yaConstruyo = true; 
                io.emit('actualizarJugadores', jugadores); io.emit('actualizarPropiedades', propiedades);
            }
        }
    });

    socket.on('terminarTurno', () => {
        if (ordenJugadores[turnoActual] === socket.id) {
            const jugador = jugadores[socket.id];
            if (jugador) { jugador.yaTiro = false; jugador.yaConstruyo = false; }
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
            if (ordenJugadores.length > 0) io.emit('actualizarTurno', ordenJugadores[turnoActual]);
        }
        delete jugadores[socket.id]; io.emit('actualizarJugadores', jugadores);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));