import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Cashfree Payment Gateway (PG API 2023-08-01). Orders are created on the server; the browser opens Cashfree's
 * checkout with the returned payment_session_id; the server then confirms the order status with Cashfree before
 * giving anything (never trusting the browser's word that it paid).
 */
const API_VERSION = '2023-08-01';
const baseUrl = () => (env.CASHFREE_ENV === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');

export const cashfreeEnabled = () => Boolean(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY);
export const cashfreeMode = () => (env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox');

async function call(method, path, body) {
  if (!cashfreeEnabled()) throw ApiError.badRequest('Online payment is not set up. Please contact the platform administrator.', undefined, 'PAYMENTS_DISABLED');
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': API_VERSION,
        'x-client-id': env.CASHFREE_APP_ID,
        'x-client-secret': env.CASHFREE_SECRET_KEY,
      },
      ...(body && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ err: err.message, path }, 'Cashfree request failed');
    throw new ApiError(502, 'GATEWAY_UNREACHABLE', 'Could not reach the payment gateway. Please try again in a minute.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn({ status: res.status, code: data.code, message: data.message, path }, 'Cashfree error');
    throw new ApiError(502, 'GATEWAY_ERROR', data.message ? `Payment gateway: ${data.message}` : 'The payment gateway refused the request.');
  }
  return data;
}

/** Creates a Cashfree order; returns { cf_order_id, payment_session_id, order_status }. */
export const createOrder = ({ orderId, amountPaise, customer, returnUrl, note, paymentMethods }) =>
  call('POST', '/orders', {
    order_id: orderId,
    order_amount: Number((amountPaise / 100).toFixed(2)),
    order_currency: 'INR',
    customer_details: { customer_id: customer.id, customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone },
    // Cashfree's page then offers only these (e.g. "cc,dc" for cards); unset = everything enabled on the account.
    order_meta: { return_url: returnUrl, ...(paymentMethods && { payment_methods: paymentMethods }) },
    order_note: note,
  });

/**
 * Pays an order with a chosen method from our own page (Order Pay API). For UPI it returns a QR image
 * (channel "qrcode"), app links (channel "link") or sends a collect request to a UPI ID (channel "collect").
 * Card details never come through here — cards go to Cashfree's own page.
 */
export async function payOrder(paymentSessionId, paymentMethod) {
  let res;
  try {
    res = await fetch(`${baseUrl()}/orders/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-version': API_VERSION },
      body: JSON.stringify({ payment_session_id: paymentSessionId, payment_method: paymentMethod }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Cashfree pay request failed');
    throw new ApiError(502, 'GATEWAY_UNREACHABLE', 'Could not reach the payment gateway. Please try again in a minute.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn({ status: res.status, code: data.code, message: data.message }, 'Cashfree pay error');
    if (data.code === 'payment_method_unsupported') throw ApiError.badRequest('This payment method is not switched on for this account yet. Please choose another way to pay.', undefined, 'METHOD_UNAVAILABLE');
    throw new ApiError(502, 'GATEWAY_ERROR', data.message ? `Payment gateway: ${data.message}` : 'The payment gateway refused the request.');
  }
  return data;
}

/** Latest attempt on an order (to say "that try failed — scan again"), or null. */
export async function latestAttempt(orderId) {
  const payments = await call('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
  const list = Array.isArray(payments) ? payments : [];
  return list.sort((a, b) => new Date(b.payment_time ?? 0) - new Date(a.payment_time ?? 0))[0] ?? null;
}

/** Current order status: ACTIVE (not paid yet), PAID, EXPIRED, TERMINATED … */
export const getOrder = (orderId) => call('GET', `/orders/${encodeURIComponent(orderId)}`);

/** Successful payment of an order, if any (method and Cashfree payment id for the receipt). */
export async function getSuccessfulPayment(orderId) {
  const payments = await call('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
  return (Array.isArray(payments) ? payments : []).find((p) => p.payment_status === 'SUCCESS') ?? null;
}

/** Webhook signature: base64(HMAC-SHA256(timestamp + rawBody, secret key)). */
export function verifyWebhookSignature(rawBody, timestamp, signature) {
  if (!rawBody || !timestamp || !signature || !env.CASHFREE_SECRET_KEY) return false;
  const expected = createHmac('sha256', env.CASHFREE_SECRET_KEY).update(timestamp + rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
