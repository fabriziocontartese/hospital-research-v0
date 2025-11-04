import { forwardRef } from 'react';
import styles from './Button.module.css';
import { cn } from '../../lib/classNames';

const ButtonComponent = (
  { children, variant = 'primary', size = 'md', icon, className, ...props },
  ref
) => (
  <button
    ref={ref}
    className={cn(styles.button, styles[`variant-${variant}`], styles[`size-${size}`], className)}
    {...props}
  >
    {icon ? <span className={styles.icon}>{icon}</span> : null}
    <span>{children}</span>
  </button>
);

export const Button = forwardRef(ButtonComponent);
