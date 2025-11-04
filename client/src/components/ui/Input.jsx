import { forwardRef } from 'react';
import styles from './Input.module.css';
import { cn } from '../../lib/classNames';

const InputComponent = ({ className, ...props }, ref) => (
  <input ref={ref} className={cn(styles.field, className)} {...props} />
);

const TextareaComponent = ({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(styles.field, styles.textarea, className)} {...props} />
);

export const Input = forwardRef(InputComponent);
export const Textarea = forwardRef(TextareaComponent);
