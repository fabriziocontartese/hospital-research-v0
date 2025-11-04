import { cn } from '../../lib/classNames';
import styles from './Card.module.css';

export const Card = ({ children, className, ...props }) => (
  <div className={cn(styles.card, className)} {...props}>
    {children}
  </div>
);

export const CardHeader = ({ children, className, actions, ...props }) => (
  <div className={cn(styles.section, styles.header, className)} {...props}>
    <div className={styles.headerContent}>{children}</div>
    {actions ? <div className={styles.headerActions}>{actions}</div> : null}
  </div>
);

export const CardTitle = ({ children, className, ...props }) => (
  <h3 className={cn(styles.title, className)} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({ children, className, ...props }) => (
  <p className={cn(styles.description, className)} {...props}>
    {children}
  </p>
);

export const CardContent = ({ children, className, ...props }) => (
  <div className={cn(styles.section, className)} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ children, className, ...props }) => (
  <div className={cn(styles.section, styles.footer, className)} {...props}>
    {children}
  </div>
);
