# EduGest Cartera

Aplicación web para registrar clientes, calcular préstamos, llevar el saldo pendiente y guardar pagos en MongoDB.

## Requisitos

- Node.js 20 o superior y npm.
- MongoDB Atlas o una instalación de MongoDB configurada como replica set. El registro de pagos usa transacciones para mantener sincronizados el pago y el saldo del préstamo.

## Configuración

1. Instala las dependencias con `npm install`.
2. Copia `.env.example` a `.env`.
3. En `.env`, configura `MONGODB_URI` con la URI de tu cluster/base de datos.
4. Genera un secreto JWT aleatorio de al menos 32 caracteres y asígnalo a `JWT_SECRET`. Por ejemplo: `openssl rand -base64 48`.
5. Inicia el servidor con `npm run dev` para desarrollo o `npm start` para producción.
6. Abre `http://localhost:3000` y crea una cuenta.

No abras `index.html` con Five Server: la aplicación requiere el servidor Node para conectar con MongoDB y atender `/api`.

## Pruebas

Ejecuta `npm test` para verificar el cálculo de las cuotas, incluida la tasa cero y la validación de valores fuera de rango.

## Colecciones

Mongoose crea las colecciones al guardar los primeros documentos:

- `users`: cuenta, correo único y hash de contraseña generado con bcrypt.
- `customers`: datos de clientes y documento único por cuenta.
- `loans`: monto, tasa anual, plazo, cuota calculada, total financiado, saldo y estado.
- `payments`: importe, fecha y referencia del préstamo.

Cada consulta de clientes, préstamos y pagos se limita al usuario autenticado. La contraseña nunca se almacena en texto plano. La cuota fija se calcula con amortización mensual; con tasa cero, el monto se divide entre el plazo.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/customers`, `DELETE /api/customers/:id`
- `GET/POST /api/loans`
- `GET/POST /api/payments`

Las rutas de negocio requieren `Authorization: Bearer <token>`.