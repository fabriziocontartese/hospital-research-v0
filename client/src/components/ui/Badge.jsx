import styles from './Badge.module.css';
import { cn } from '../../lib/classNames';

export const Badge = ({ children, variant = 'neutral', className }) => (
  <span className={cn(styles.badge, styles[`variant-${variant}`], className)}>{children}</span>
);
