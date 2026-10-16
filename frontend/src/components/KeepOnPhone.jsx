/**
 * Phones hide field hints to stay compact (see MuiFormHelperText in the theme). Wrap a hint in this when it is
 * needed to fill the field right — an amount due, a limit, why a field is locked — and it stays on phones too.
 */
export default function KeepOnPhone({ children }) {
  return <span className="keep-on-phone">{children}</span>;
}
