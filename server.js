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

const gruposColor = [
    [1, 3], [6, 8, 9], [11, 13, 14], [16, 18, 19], 
    [21, 23, 24], [26, 27, 29], [31, 32, 34], [37, 39]          
];

const volcanes = [5, 15, 25, 35];

const cartasCPN = [
    { texto: "¡Error a favor en el sistema de la Cooperativa! Recibes $200.", accion: "ganar", valor: 200 },
    { texto: "Pago de impuestos municipales. Paga $50 al centro.", accion: "pagar", valor: 50 },
    { texto: "Ventas excelentes en tu tienda esta semana. Recibes $100.", accion: "ganar", valor: 100 },
    { texto: "Gastos de trámites de titulación. Paga $100 al centro.", accion: "pagar", valor: 100 },
    { texto: "¡Ganas la lotería local! Recibes $150.", accion: "ganar", valor: 150 },
    { texto: "Exceso de velocidad. Multa de $20 al centro.", accion: "pagar", valor: 20 },
    { texto: "Ve directamente a la cárcel. No pases por SALIDA.", accion: "carcel", valor: 0 },
    { texto: "Avanza directamente hasta la SALIDA y cobra $200.", accion: "salida", valor: 0 }
];

const cartasCanales = [
    { texto: "Haces un pago rápido por la App Móvil. Recibes $100.", accion: "ganar", valor: 100 },
    { texto: "Pides un duplicado de tarjeta. Paga $20 al centro.", accion: "pagar", valor: 20 },
    { texto: "Actualizas tus datos en la sucursal virtual. Recibes $50.", accion: "ganar", valor: 50 },
    { texto: "Llamada al Call Center. Paga $15 al centro.", accion: "pagar", valor: 15 },
    { texto: "Recibes una transferencia internacional. Recibes $150.", accion: "ganar", valor: 150 },
    { texto: "Cajero retenido por intento de fraude. Ve a la cárcel.", accion: "carcel", valor: 0 },
    { texto: "Uso de cajero de otra red. Paga comisión de $30 al centro.", accion: "pagar", valor: 30 },
    { texto: "Campaña de ahorro programado. Avanza hasta la SALIDA y cobra $200.", accion: "salida", valor: 0 }
];

io.on('connection', (socket) => {
    console.log('Nuevo dispositivo: ' + socket.id);

    socket.on('unirseAlJuego', (nombre) => {
        jugadores[socket.id] = {
            id: socket.id, nombre: nombre, 
            dinero: 1000, // MODIFICADO: Dinero inicial de $1000
            posicion: 0, 
            color: colores[colorIndex % colores.length],
            vueltas: 0, yaConstruyo: false, yaTiro: false, enCarcel: false, turnosCarcel: 0,
            prestamo: { activo: false, limitePosicion: 0 } // NUEVO: Sistema de Préstamo
        };
        colorIndex++;
        ordenJugadores.push(socket.id); 

        io.emit('actualizarJugadores', jugadores);
        io.emit('actualizarPropiedades', propiedades);
        io.emit('actualizarTurno', ordenJugadores[turnoActual]);
        io.emit('actualizarBote', boteCentro); 
    });

    // NUEVO: Petición de Préstamo
    socket.on('pedirPrestamo', () => {
        if (ordenJugadores[turnoActual] !== socket.id) return;
        const jugador = jugadores[socket.id];
        if (jugador && !jugador.prestamo.activo) {
            jugador.dinero += 500;
            // Se debe pagar antes de dar exactamente una vuelta (40 casillas de distancia absoluta)
            jugador.prestamo = { activo: true, limitePosicion: (jugador.vueltas * 40) + jugador.posicion + 40 };
            io.emit('alertaGlobal', `🏦 ${jugador.nombre} ha solicitado un préstamo bancario de $500.`);
            io.emit('actualizarJugadores', jugadores);
        }
    });

    // NUEVO: Pago manual del Préstamo
    socket.on('pagarPrestamo', () => {
        if (ordenJugadores[turnoActual] !== socket.id) return;
        const jugador = jugadores[socket.id];
        if (jugador && jugador.prestamo.activo) {
            if (jugador.dinero >= 550) {
                jugador.dinero -= 550;
                jugador.prestamo.activo = false;
                io.emit('alertaGlobal', `💵 ${jugador.nombre} ha pagado su deuda de $550 al banco.`);
                io.emit('actualizarJugadores', jugadores);
            } else {
                socket.emit('alertaGlobal', 'No tienes $550 para pagar el préstamo todavía.');
            }
        }
    });

    socket.on('pagarFianza', () => {
        if (ordenJugadores[turnoActual] !== socket.id) return;
        const jugador = jugadores[socket.id];
        
        if (jugador && jugador.enCarcel && jugador.dinero >= 50 && !jugador.yaTiro) {
            jugador.dinero -= 50; boteCentro += 50; 
            jugador.enCarcel = false; jugador.turnosCarcel = 0;
            io.emit('alertaGlobal', `💸 ${jugador.nombre} pagó $50 al centro de la mesa por su fianza.`);
            io.emit('actualizarJugadores', jugadores); io.emit('actualizarBote', boteCentro);
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

            // NUEVO: Cobro Automático del Préstamo si se pasa de la raya
            if (jugador.prestamo.activo) {
                const posAbsoluta = (jugador.vueltas * 40) + jugador.posicion;
                if (posAbsoluta >= jugador.prestamo.limitePosicion) {
                    jugador.dinero -= 550;
                    jugador.prestamo.activo = false;
                    io.emit('alertaGlobal', `🚨 ¡Tiempo agotado! El banco cobró automáticamente $550 a ${jugador.nombre} por el préstamo.`);
                }
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
            
            if (jugador.posicion === 20) {
                if (boteCentro > 0) {
                    io.emit('alertaGlobal', `🎉 ¡JACKPOT! ${jugador.nombre} cayó en Parada Libre y se llevó $${boteCentro} del centro.`);
                    jugador.dinero += boteCentro; boteCentro = 0;
                    io.emit('actualizarBote', boteCentro); io.emit('actualizarJugadores', jugadores);
                }
                return; 
            }

            if (jugador.posicion === 4 || jugador.posicion === 38) {
                jugador.dinero -= 200; boteCentro += 200;
                io.emit('alertaGlobal', `🧾 ¡Ouch! ${jugador.nombre} pagó $200 de Impuestos al centro de la mesa.`);
                io.emit('actualizarBote', boteCentro); io.emit('actualizarJugadores', jugadores);
                return; 
            }

            if (jugador.posicion === 2 || jugador.posicion === 17 || jugador.posicion === 33) {
                const carta = cartasCPN[Math.floor(Math.random() * cartasCPN.length)];
                aplicarCarta(carta, jugador);
                io.emit('mostrarCartaCPN', { jugador: jugador.nombre, carta: carta.texto });
                io.emit('actualizarJugadores', jugadores);
                return; 
            }

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
                    let alquiler = 0;
                    if (jugador.posicion === 12 || jugador.posicion === 28) {
                        let oficinasPropias = 0;
                        if (propiedades[12] && propiedades[12].dueno === propiedad.dueno) oficinasPropias++;
                        if (propiedades[28] && propiedades[28].dueno === propiedad.dueno) oficinasPropias++;
                        alquiler = totalDado * (oficinasPropias === 2 ? 10 : 4);
                    } else if (volcanes.includes(jugador.posicion)) {
                        let volcanesPropios = 0;
                        volcanes.forEach(idx => { if (propiedades[idx] && propiedades[idx].dueno === propiedad.dueno) volcanesPropios++; });
                        alquiler = volcanesPropios * 50; 
                    } else {
                        if (propiedad.hotel) alquiler = propiedad.rentas[5];
                        else if (propiedad.casas > 0) alquiler = propiedad.rentas[propiedad.casas];
                        else {
                            let tieneMonopolio = false;
                            for (let grupo of gruposColor) {
                                if (grupo.includes(jugador.posicion)) {
                                    tieneMonopolio = grupo.every(indice => propiedades[indice] && propiedades[indice].dueno === propiedad.dueno);
                                    break;
                                }
                            }
                            alquiler = propiedad.rentas[0];
                            if (tieneMonopolio) alquiler *= 2;
                        }
                    }

                    jugador.dinero -= alquiler;
                    if (jugadores[propiedad.dueno]) jugadores[propiedad.dueno].dinero += alquiler;
                    io.emit('pagoAlquiler', { pagador: jugador.nombre, cobrador: jugadores[propiedad.dueno] ? jugadores[propiedad.dueno].nombre : 'el banco', monto: alquiler });
                    io.emit('actualizarJugadores', jugadores);
                } else {
                    if (!propiedad.hotel && !jugador.yaConstruyo && jugador.posicion !== 12 && jugador.posicion !== 28 && !volcanes.includes(jugador.posicion)) { 
                        io.to(socket.id).emit('preguntarConstruccion', jugador.posicion); 
                    }
                }
            } else if (jugador.vueltas > 0) {
                io.to(socket.id).emit('preguntarCompra', jugador.posicion);
            }
        }
    });

    function aplicarCarta(carta, jugador) {
        if (carta.accion === "ganar") { jugador.dinero += carta.valor; } 
        else if (carta.accion === "pagar") { jugador.dinero -= carta.valor; boteCentro += carta.valor; io.emit('actualizarBote', boteCentro); } 
        else if (carta.accion === "carcel") { jugador.posicion = 10; jugador.enCarcel = true; jugador.turnosCarcel = 0; } 
        else if (carta.accion === "salida") { jugador.posicion = 0; jugador.dinero += 200; jugador.vueltas++; }
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
        casillaIndex = parseInt(casillaIndex); 
        if (casillaIndex === 12 || casillaIndex === 28 || volcanes.includes(casillaIndex)) return; 
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
            
            // CANDADO ESTRICTO: Si no ha tirado, el servidor ignora el clic
            if (jugador && !jugador.yaTiro) return; 

            if (jugador) { 
                jugador.yaTiro = false; 
                jugador.yaConstruyo = false; 
            }
            
            turnoActual++;
            if (turnoActual >= ordenJugadores.length) turnoActual = 0;
            
            io.emit('actualizarTurno', ordenJugadores[turnoActual]);
            io.emit('actualizarJugadores', jugadores); // ESTO FALTABA: Refresca el estado para todos
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