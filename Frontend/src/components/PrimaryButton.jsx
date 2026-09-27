export default function PrimaryButton({ children, busy = false, busyLabel, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`btn btn-primary ${className}`.trim()}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy && <span className="spinner" aria-hidden="true" />}
      {busy ? busyLabel || 'Working...' : children}
    </button>
  );
}
