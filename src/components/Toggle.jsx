export default function Toggle({ on, onChange, disabled = false }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      className={`toggle-track ${on ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
    >
      <div className="toggle-knob" />
    </div>
  );
}
