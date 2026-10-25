// Number boxes often start at "0": typing 25000 after it would read 025000. This drops the leading
// zeros as you type ("0.5" stays), app-wide, for amount/weight/percent boxes (inputMode "decimal") and
// count boxes marked data-number. Mobile, pincode, OTP, HSN and account numbers are "numeric" and left
// alone — a leading zero can mean something there.
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

const isNumberBox = (el) => el instanceof HTMLInputElement && (el.inputMode === 'decimal' || el.dataset.number !== undefined);

export function installNoLeadingZeros() {
  // Capture on window runs before React reads the box, so its onChange already gets the clean value.
  window.addEventListener(
    'input',
    (e) => {
      const el = e.target;
      if (!isNumberBox(el)) return;
      const zeros = /^0+(?=\d)/.exec(el.value)?.[0].length;
      if (!zeros) return;
      const caret = el.selectionStart;
      // The prototype setter skips React's value tracking, so React still sees this as a change.
      valueSetter.call(el, el.value.slice(zeros));
      if (caret !== null) el.setSelectionRange(Math.max(0, caret - zeros), Math.max(0, caret - zeros));
    },
    true,
  );
}
