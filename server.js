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
            vueltas: 0
        };
        colorIndex++;
        io.emit('actualizarJugadores', jugadores);
        io.emit('actualizarPropiedades', propiedades);
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
            jugador.vueltas++;
        }

        io.emit('resultadoDado', { nombre: jugador.nombre, dado: totalDado, dado1, dado2 });
        io.emit('actualizarJugadores', jugadores);

        // Lógica principal de la casilla en la que cayó
        if (jugador.posicion !== 0) {
            const propiedad = propiedades[jugador.posicion];
            
            if (propiedad) {
                // SI TIENE DUEÑO Y NO SOY YO, PAGO ALQUILER
                if (propiedad.dueno !== socket.id) {
                    let alquiler = 0;
                    
                    // Cobramos según tu lista personalizada de rentas
                    if (propiedad.hotel) {
                        alquiler = propiedad.rentas[5]; // Precio con hotel
                    } else {
                        alquiler = propiedad.rentas[propiedad.casas]; // Precio según cantidad de casas (0 a 4)
                    }
                    
                    // Descuento y pago
                    jugador.dinero -= alquiler;
                    if (jugadores[propiedad.dueno]) {
                        jugadores[propiedad.dueno].dinero += alquiler;
                    }
                    
                    io.emit('pagoAlquiler', {
                        pagador: jugador.nombre,
                        cobrador: jugadores[propiedad.dueno] ? jugadores[propiedad.dueno].nombre : 'el banco',
                        monto: alquiler
                    });
                    io.emit('actualizarJugadores', jugadores);
                }
            } else if (jugador.vueltas > 0) {
                // SI ESTÁ LIBRE Y YA DI UNA VUELTA, ME PREGUNTA SI COMPRO
                io.to(socket.id).emit('preguntarCompra', jugador.posicion);
            }
        }
    });

    // Guardar la compra con tus rentas personalizadas
    socket.on('comprarPropiedad', (datos) => {
        const jugador = jugadores[socket.id];
        if (jugador && jugador.dinero >= datos.precio) {
            jugador.dinero -= datos.precio;
            propiedades[datos.casilla] = {
                dueno: socket.id,
                colorDueno: jugador.color,
                precioBase: datos.precio,
                rentas: datos.rentas, // Guardamos los precios que pusiste en el HTML
                casas: 0,
                hotel: false
            };
            io.emit('actualizarJugadores', jugadores);
            io.emit('actualizarPropiedades', propiedades);
        }
    });

    // Comprar casas u hoteles
    socket.on('comprarCasa', (casillaIndex) => {
        const jugador = jugadores[socket.id];
        const propiedad = propiedades[casillaIndex];
        
        if (propiedad && propiedad.dueno === socket.id) {
            const costoMejora = Math.floor(propiedad.precioBase * 0.5); // La casa cuesta la mitad de la propiedad
            
            if (jugador.dinero >= costoMejora) {
                if (propiedad.casas < 4 && !propiedad.hotel) {
                    propiedad.casas++;
                    jugador.dinero -= costoMejora;
                } else if (propiedad.casas === 4 && !propiedad.hotel) {
                    propiedad.casas = 0;
                    propiedad.hotel = true;
                    jugador.dinero -= costoMejora;
                }
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