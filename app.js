(() => {
  'use strict';

  const tokenKey = 'edugest_token';
  const state = { token: localStorage.getItem(tokenKey), user: null, customers: [], loans: [], payments: [] };
  const $ = (selector) => document.querySelector(selector);
  const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(`/api${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
    return data;
  }

  function notify(message, error = false) {
    const toast = document.createElement('p');
    toast.className = `toast${error ? ' toast-error' : ''}`;
    toast.textContent = message;
    $('#toast-region').append(toast);
    window.setTimeout(() => toast.remove(), 4000);
  }

  function showWorkspace(user) {
    state.user = user;
    $('#auth-view').hidden = true;
    $('#workspace').hidden = false;
    $('#account-name').textContent = user.name;
    $('#account-avatar').textContent = user.name.trim().charAt(0).toUpperCase();
    loadData();
  }

  function showAuth() {
    state.token = null;
    state.user = null;
    localStorage.removeItem(tokenKey);
    $('#workspace').hidden = true;
    $('#auth-view').hidden = false;
  }

  async function loadData() {
    try {
      [state.customers, state.loans, state.payments] = await Promise.all([
        api('/customers'), api('/loans'), api('/payments')
      ]);
      renderData();
    } catch (error) {
      notify(error.message, true);
    }
  }

  function renderData() {
    renderCustomers();
    renderLoans();
    renderPayments();
    renderOverview();
    renderOptions();
  }

  function renderCustomers() {
    const rows = state.customers.map((customer) => `
      <tr>
        <td><strong>${escapeHtml(customer.name)}</strong></td>
        <td>${escapeHtml(customer.document)}</td>
        <td>${escapeHtml(customer.phone || '—')}</td>
        <td>${escapeHtml(customer.email || '—')}</td>
        <td class="cell-action"><button class="delete-button" type="button" data-delete-customer="${customer._id}" aria-label="Eliminar ${escapeHtml(customer.name)}" title="Eliminar cliente">×</button></td>
      </tr>`).join('');
    $('#customers-table').innerHTML = rows || '<tr><td class="table-empty" colspan="5">No hay clientes registrados.</td></tr>';
  }

  function statusBadge(loan) {
    const paid = loan.status === 'paid';
    return `<span class="badge ${paid ? 'badge-paid' : 'badge-active'}">${paid ? 'Pagado' : 'Activo'}</span>`;
  }

  function loanRows(loans, overview = false) {
    return loans.map((loan) => {
      const customer = loan.customer?.name || 'Cliente';
      const cells = overview
        ? `<td><strong>${escapeHtml(customer)}</strong></td><td>${money.format(loan.principal)}</td><td>${money.format(loan.monthlyPayment)}</td><td>${money.format(loan.balance)}</td><td>${statusBadge(loan)}</td>`
        : `<td><strong>${escapeHtml(customer)}</strong></td><td>${money.format(loan.principal)}</td><td>${Number(loan.annualRate).toFixed(2)}%</td><td>${loan.termMonths} meses</td><td>${money.format(loan.monthlyPayment)}</td><td>${money.format(loan.balance)}</td><td>${statusBadge(loan)}</td>`;
      return `<tr>${cells}</tr>`;
    }).join('');
  }

  function renderLoans() {
    const rows = loanRows(state.loans);
    $('#loans-table').innerHTML = rows || '<tr><td class="table-empty" colspan="7">No hay préstamos registrados.</td></tr>';
  }

  function renderPayments() {
    const rows = state.payments.map((payment) => `
      <tr>
        <td>${dateFormat.format(new Date(payment.paidAt))}</td>
        <td><strong>${escapeHtml(payment.loan?.customer?.name || 'Cliente')}</strong></td>
        <td>${money.format(payment.loan?.principal || 0)}</td>
        <td class="amount-cell">${money.format(payment.amount)}</td>
        <td>${escapeHtml(payment.note || '—')}</td>
      </tr>`).join('');
    $('#payments-table').innerHTML = rows || '<tr><td class="table-empty" colspan="5">No hay pagos registrados.</td></tr>';
  }

  function renderOverview() {
    const activeLoans = state.loans.filter((loan) => loan.status === 'active');
    const balance = state.loans.reduce((sum, loan) => sum + loan.balance, 0);
    const paid = state.payments.reduce((sum, payment) => sum + payment.amount, 0);
    $('#metric-customers').textContent = state.customers.length;
    $('#metric-active').textContent = activeLoans.length;
    $('#metric-balance').textContent = money.format(balance);
    $('#metric-paid').textContent = money.format(paid);
    const rows = loanRows(state.loans.slice(0, 6), true);
    $('#overview-loans').innerHTML = rows || '<tr><td class="table-empty" colspan="5">Todavía no hay préstamos registrados.</td></tr>';
  }

  function renderOptions() {
    const customerOptions = state.customers.map((customer) =>
      `<option value="${customer._id}">${escapeHtml(customer.name)} · ${escapeHtml(customer.document)}</option>`).join('');
    $('#loan-customer').innerHTML = `<option value="">Selecciona un cliente</option>${customerOptions}`;
    const activeLoans = state.loans.filter((loan) => loan.status === 'active');
    const loanOptions = activeLoans.map((loan) =>
      `<option value="${loan._id}">${escapeHtml(loan.customer?.name || 'Cliente')} · saldo ${money.format(loan.balance)}</option>`).join('');
    $('#payment-loan').innerHTML = `<option value="">Selecciona un préstamo activo</option>${loanOptions}`;
  }

  function calculatePayment(principal, annualRate, termMonths) {
    const monthlyRate = annualRate / 1200;
    if (!monthlyRate) return principal / termMonths;
    const factor = (1 + monthlyRate) ** termMonths;
    return principal * monthlyRate * factor / (factor - 1);
  }

  function updateEstimate() {
    const form = $('#loan-form');
    const principal = Number(form.elements.principal.value);
    const annualRate = Number(form.elements.annualRate.value);
    const term = Number(form.elements.termMonths.value);
    if (principal > 0 && annualRate >= 0 && term > 0) {
      $('#loan-estimate').textContent = `Cuota mensual estimada: ${money.format(calculatePayment(principal, annualRate, term))}`;
    } else {
      $('#loan-estimate').textContent = 'Ingresa monto, tasa y plazo para estimar la cuota mensual.';
    }
  }

  async function submitForm(form, path, successMessage) {
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await api(path, { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      form.hidden = true;
      notify(successMessage);
      await loadData();
    } catch (error) {
      notify(error.message, true);
    }
  }

  document.addEventListener('click', async (event) => {
    const authTab = event.target.closest('[data-auth-tab]');
    if (authTab) {
      const isLogin = authTab.dataset.authTab === 'login';
      $('#login-form').hidden = !isLogin;
      $('#register-form').hidden = isLogin;
      $('#login-tab').classList.toggle('is-active', isLogin);
      $('#register-tab').classList.toggle('is-active', !isLogin);
      $('#login-tab').setAttribute('aria-selected', String(isLogin));
      $('#register-tab').setAttribute('aria-selected', String(!isLogin));
      $('#auth-title').textContent = isLogin ? 'Accede a tu cuenta' : 'Crea tu cuenta';
      $('#auth-message').textContent = '';
      return;
    }

    const nav = event.target.closest('[data-view]');
    const targetView = nav?.dataset.view || event.target.closest('[data-go]')?.dataset.go;
    if (targetView) {
      const labels = { overview: ['VISTA GENERAL', 'Resumen'], customers: ['DIRECTORIO', 'Clientes'], loans: ['CRÉDITOS', 'Préstamos'], payments: ['MOVIMIENTOS', 'Pagos'] };
      document.querySelectorAll('[data-screen]').forEach((panel) => { panel.hidden = panel.dataset.screen !== targetView; });
      document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.view === targetView));
      $('#page-kicker').textContent = labels[targetView][0];
      $('#page-title').textContent = labels[targetView][1];
      return;
    }

    const openButton = event.target.closest('[data-open-form]');
    if (openButton) {
      const form = $(`#${openButton.dataset.openForm}`);
      form.hidden = false;
      form.querySelector('input, select')?.focus();
      return;
    }

    const closeButton = event.target.closest('[data-close-form]');
    if (closeButton) {
      $(`#${closeButton.dataset.closeForm}`).hidden = true;
      return;
    }

    const deleteButton = event.target.closest('[data-delete-customer]');
    if (deleteButton && window.confirm('¿Eliminar este cliente?')) {
      try {
        await api(`/customers/${deleteButton.dataset.deleteCustomer}`, { method: 'DELETE' });
        notify('Cliente eliminado.');
        await loadData();
      } catch (error) { notify(error.message, true); }
    }
  });

  document.addEventListener('submit', (event) => {
    const { target: form } = event;
    if (form.id === 'login-form' || form.id === 'register-form') {
      event.preventDefault();
      const isRegister = form.id === 'register-form';
      const payload = Object.fromEntries(new FormData(form).entries());
      api(`/auth/${isRegister ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(payload) })
        .then((data) => {
          state.token = data.token;
          localStorage.setItem(tokenKey, data.token);
          showWorkspace(data.user);
        })
        .catch((error) => { $('#auth-message').textContent = error.message; });
      return;
    }

    const routes = {
      'customer-form': ['/customers', 'Cliente registrado.'],
      'loan-form': ['/loans', 'Préstamo registrado.'],
      'payment-form': ['/payments', 'Pago registrado y saldo actualizado.']
    };
    if (routes[form.id]) {
      event.preventDefault();
      submitForm(form, ...routes[form.id]);
    }
  });

  $('#logout-button').addEventListener('click', showAuth);
  $('#loan-form').addEventListener('input', updateEstimate);
  $('#loan-form').addEventListener('change', updateEstimate);

  async function initialize() {
    if (!state.token) return;
    try {
      const { user } = await api('/auth/me');
      showWorkspace(user);
    } catch {
      showAuth();
    }
  }

  initialize();
})();