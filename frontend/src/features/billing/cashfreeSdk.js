const SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js';

/** Loads Cashfree's checkout script once (for cards, net banking, wallets — their secure page). */
export function loadCashfree() {
  if (window.Cashfree) return Promise.resolve(window.Cashfree);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => (window.Cashfree ? resolve(window.Cashfree) : reject(new Error('Cashfree did not load')));
    script.onerror = () => reject(new Error('Could not load the payment page. Check your internet connection.'));
    document.head.appendChild(script);
  });
}

/** Sends the browser to Cashfree's secure page for this checkout; it comes back to the subscription page. */
export async function openCashfreeCheckout({ paymentSessionId, mode }) {
  const Cashfree = await loadCashfree();
  const cashfree = Cashfree({ mode: mode === 'production' ? 'production' : 'sandbox' });
  return cashfree.checkout({ paymentSessionId, redirectTarget: '_self' });
}
