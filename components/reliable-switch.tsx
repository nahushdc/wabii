import { useState, useEffect, ComponentProps } from 'react';
import { Switch } from 'react-native';

// RN's Switch (especially on the New Architecture) can fail to draw the thumb
// in the right spot when it's created already "on" and never actually
// toggled by the user — the value is correct, the visual isn't. Mounting
// false and flipping to the real value a frame later turns the first paint
// into a genuine transition, which reliably renders correctly.
export function ReliableSwitch({ value, ...props }: ComponentProps<typeof Switch>) {
  const [displayValue, setDisplayValue] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDisplayValue(!!value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <Switch value={displayValue} {...props} />;
}
