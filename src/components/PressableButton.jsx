import { forwardRef, useState } from 'react';

// Shared tap feedback for flat (non-toggle) buttons: press to shrink slightly
// and dim, release to snap back. Centralizing this means individual buttons
// never need to track their own pressed state.
const PressableButton = forwardRef(function PressableButton(
  { style, onClick, children, className, ...rest },
  ref
) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      ref={ref}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={className}
      style={{
        ...style,
        opacity: pressed ? 0.6 : style?.opacity ?? 1,
        transform: pressed ? 'scale(0.96)' : style?.transform ?? 'scale(1)',
        transition: 'opacity 0.12s ease, transform 0.12s ease',
      }}
      {...rest}
    >
      {children}
    </button>
  );
});

export default PressableButton;
