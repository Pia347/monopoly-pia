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
            yaConstruyo: false // <-- NUEVO: El candado inicia cerrado
        };
        colorIndex++;
        io.emit('actualizarJugadores', jugadores);
        io.emit('actualizarPropiedades', propiedades);
    });

    socket.on('tirarDado', () => {
        const jugador = jugadores[socket.id];
        if (!jugador) return;

        // NUEVO: Cada vez que tira el dado, le abrimos el candado por si cae en su propiedad
        jugador.yaConstruyo = false; 

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
                    // Paga alquiler
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
                    // Cae en su propiedad, y si NO ha construido este turno, le preguntamos
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
            
            // 🔥 NUEVO CANDADO ESTRICTO: 
            // Como acabas de comprar el terreno, cerramos el candado de este turno.
            // Así es imposible que construyas una casa hoy.
            jugador.yaConstruyo = true; 
            
            io.emit('actualizarJugadores', jugadores);
            io.emit('actualizarPropiedades', propiedades);
        }
    });

    socket.on('comprarCasa', (casillaIndex) => {
        const jugador = jugadores[socket.id];
        const propiedad = propiedades[casillaIndex];
        
        // REGLA ESTRICTA: Solo si es dueño, está parado ahí, Y NO HA CONSTRUIDO en este turno
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
                
                // NUEVO: Bloqueamos el candado para que no pueda volver a construir hasta el próximo turno
                jugador.yaConstruyo = true; 
                
                io.emit('actualizarJugadores', jugadores);
                io.emit('actualizarPropiedades', propiedades);
            }
        }
    });

    socket.on('disconnect', () => {
        delete jugadores[socket.id];
        io.emit('actualizarJugadores', jugadores);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));