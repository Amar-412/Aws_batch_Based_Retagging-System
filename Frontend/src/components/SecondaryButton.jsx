export default function SecondaryButton({ children, busy = false, busyLabel, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`btn btn-secondary ${className}`.trim()}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy && <span className="spinner spinner-dark" aria-hidden="true" />}
      {busy ? busyLabel || 'Working...' : children}
    </button>
  );
}
