require('dotenv').config();

const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { calculateMonthlyPayment } = require('./loan-calculator');

const app = express();
const port = Number(process.env.PORT) || 3000;
const jwtSecret = process.env.JWT_SECRET;

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true }
}, { timestamps: true });

const customerSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  document: { type: String, required: true, trim: true, maxlength: 40 },
  phone: { type: String, trim: true, maxlength: 40 },
  email: { type: String, trim: true, lowercase: true, maxlength: 160 },
  address: { type: String, trim: true, maxlength: 240 }
}, { timestamps: true });
customerSchema.index({ owner: 1, document: 1 }, { unique: true });

const loanSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  principal: { type: Number, required: true, min: 0.01 },
  annualRate: { type: Number, required: true, min: 0, max: 100 },
  termMonths: { type: Number, required: true, min: 1, max: 600 },
  monthlyPayment: { type: Number, required: true },
  totalDue: { type: Number, required: true },
  amountPaid: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'paid'], default: 'active' },
  startDate: { type: Date, required: true }
}, { timestamps: true });

const paymentSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  loan: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', required: true },
  amount: { type: Number, required: true, min: 0.01 },
  paidAt: { type: Date, required: true },
  note: { type: String, trim: true, maxlength: 240 }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Customer = mongoose.model('Customer', customerSchema);
const Loan = mongoose.model('Loan', loanSchema);
const Payment = mongoose.model('Payment', paymentSchema);

app.use(express.json({ limit: '32kb' }));

// Los modelos separan datos por cuenta y los índices únicos evitan duplicados locales.
function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function requireFields(body, fields) {
  return fields.every((field) => body[field] !== undefined && String(body[field]).trim() !== '');
}

function createToken(user) {
  return jwt.sign({ sub: user.id, name: user.name }, jwtSecret, { expiresIn: '12h' });
}

function authenticate(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return sendError(res, 401, 'Inicia sesión para continuar.');
  try {
    req.userId = jwt.verify(token, jwtSecret).sub;
    next();
  } catch {
    return sendError(res, 401, 'La sesión venció. Inicia sesión de nuevo.');
  }
}

// Autenticación: contraseñas con hash bcrypt y tokens de acceso de duración limitada.
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!requireFields(req.body, ['name', 'email', 'password']) || String(name).trim().length < 3 || !validEmail || typeof password !== 'string' || password.length < 8) {
      return sendError(res, 400, 'Indica un nombre, correo válido y una contraseña de al menos 8 caracteres.');
    }
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12)
    });
    return res.status(201).json({ token: createToken(user), user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, 'Ya existe una cuenta con ese correo.');
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(String(req.body.password || ''), user.passwordHash)) {
      return sendError(res, 401, 'Correo o contraseña incorrectos.');
    }
    return res.json({ token: createToken(user), user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auth/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('name email');
    if (!user) return sendError(res, 401, 'La cuenta ya no existe.');
    return res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/customers', authenticate, async (req, res, next) => {
  try {
    const customers = await Customer.find({ owner: req.userId }).sort({ name: 1 }).lean();
    return res.json(customers);
  } catch (error) { return next(error); }
});

app.post('/api/customers', authenticate, async (req, res, next) => {
  try {
    if (!requireFields(req.body, ['name', 'document'])) return sendError(res, 400, 'Nombre y documento son obligatorios.');
    const customer = await Customer.create({
      name: req.body.name,
      document: req.body.document,
      phone: req.body.phone,
      email: req.body.email,
      address: req.body.address,
      owner: req.userId
    });
    return res.status(201).json(customer);
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, 'Ya existe un cliente con ese documento.');
    return next(error);
  }
});

app.delete('/api/customers/:id', authenticate, async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, owner: req.userId });
    if (!customer) return sendError(res, 404, 'Cliente no encontrado.');
    if (await Loan.exists({ customer: customer.id, owner: req.userId })) {
      return sendError(res, 409, 'No se puede eliminar un cliente que tiene préstamos registrados.');
    }
    await customer.deleteOne();
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.get('/api/loans', authenticate, async (req, res, next) => {
  try {
    const loans = await Loan.find({ owner: req.userId }).populate('customer', 'name document').sort({ createdAt: -1 }).lean();
    return res.json(loans.map((loan) => ({ ...loan, balance: Math.max(0, loan.totalDue - loan.amountPaid) })));
  } catch (error) { return next(error); }
});

app.post('/api/loans', authenticate, async (req, res, next) => {
  try {
    if (!requireFields(req.body, ['customerId', 'principal', 'annualRate', 'termMonths', 'startDate'])) {
      return sendError(res, 400, 'Completa cliente, monto, tasa, plazo y fecha de inicio.');
    }
    const principal = Number(req.body.principal);
    const annualRate = Number(req.body.annualRate);
    const termMonths = Number(req.body.termMonths);
    const startDate = new Date(req.body.startDate);
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100 || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 600 || Number.isNaN(startDate.getTime())) {
      return sendError(res, 400, 'Revisa el monto, la tasa, el plazo y la fecha.');
    }
    const customer = await Customer.findOne({ _id: req.body.customerId, owner: req.userId });
    if (!customer) return sendError(res, 404, 'Cliente no encontrado.');
    const monthlyPayment = Number(calculateMonthlyPayment(principal, annualRate, termMonths).toFixed(2));
    const totalDue = Number((monthlyPayment * termMonths).toFixed(2));
    const loan = await Loan.create({
      owner: req.userId,
      customer: customer.id,
      principal,
      annualRate,
      termMonths,
      monthlyPayment,
      totalDue,
      startDate
    });
    await loan.populate('customer', 'name document');
    return res.status(201).json({ ...loan.toObject(), balance: loan.totalDue });
  } catch (error) { return next(error); }
});

app.get('/api/payments', authenticate, async (req, res, next) => {
  try {
    const payments = await Payment.find({ owner: req.userId }).populate({ path: 'loan', select: 'principal customer', populate: { path: 'customer', select: 'name' } }).sort({ paidAt: -1 }).lean();
    return res.json(payments);
  } catch (error) { return next(error); }
});

app.post('/api/payments', authenticate, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    if (!requireFields(req.body, ['loanId', 'amount', 'paidAt'])) return sendError(res, 400, 'Préstamo, valor y fecha son obligatorios.');
    const amount = Number(req.body.amount);
    const paidAt = new Date(req.body.paidAt);
    if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(paidAt.getTime())) return sendError(res, 400, 'El valor o la fecha del pago no son válidos.');

    let payment;
    // Actualiza el saldo y registra el movimiento como una sola operación atómica.
    await session.withTransaction(async () => {
      const loan = await Loan.findOne({ _id: req.body.loanId, owner: req.userId }).session(session);
      if (!loan) throw Object.assign(new Error('Préstamo no encontrado.'), { status: 404 });
      const balance = Math.max(0, loan.totalDue - loan.amountPaid);
      if (amount > balance + 0.009) throw Object.assign(new Error('El pago supera el saldo pendiente.'), { status: 400 });
      loan.amountPaid = Math.min(loan.totalDue, Number((loan.amountPaid + amount).toFixed(2)));
      loan.status = loan.amountPaid >= loan.totalDue ? 'paid' : 'active';
      await loan.save({ session });
      [payment] = await Payment.create([{
        owner: req.userId,
        loan: loan.id,
        amount,
        paidAt,
        note: req.body.note
      }], { session });
    });
    return res.status(201).json(payment);
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.message);
    return next(error);
  } finally {
    await session.endSession();
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));

app.use((error, req, res, next) => {
  console.error(error);
  if (error.type === 'entity.parse.failed') return sendError(res, 400, 'El JSON enviado no tiene un formato válido.');
  if (error.name === 'ValidationError' || error.name === 'CastError') return sendError(res, 400, 'Los datos enviados no son válidos.');
  return sendError(res, 500, 'Ocurrió un error interno.');
});

async function start() {
  if (!jwtSecret || jwtSecret.length < 32) throw new Error('Configura JWT_SECRET con al menos 32 caracteres en el archivo .env.');
  if (!process.env.MONGODB_URI) throw new Error('Configura MONGODB_URI en el archivo .env.');
  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(port, () => console.log(`EduGest disponible en http://localhost:${port}`));
}

start().catch((error) => {
  console.error(`No se pudo iniciar EduGest: ${error.message}`);
  process.exit(1);
});