import { useEffect, useState } from 'react';
import styles from './StudyEditor.module.css';

const StudyEditor = ({ initialValue, onSave, onCancel, submitLabel }) => {
  const isEditing = Boolean(initialValue);

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('draft');

  useEffect(() => {
    if (initialValue) {
      setCode(initialValue.code || '');
      setTitle(initialValue.title || '');
      setStatus(initialValue.status || 'draft');
    } else {
      setCode('');
      setTitle('');
      setStatus('draft');
    }
  }, [initialValue]);

  const onSubmit = (event) => {
    event.preventDefault();
    onSave({
      code: code.trim(),
      title: title.trim(),
      status,
    });
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.grid}>
        <label>
          Study code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            disabled={isEditing}
            placeholder="e.g. RESP-2025"
          />
        </label>
        <label>
          Study title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="Primary outcome cohort"
          />
        </label>
      </div>

      {isEditing ? (
        <label>
          Study status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      ) : null}

      <div className={styles.actions}>
        {onCancel ? (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className={styles.primary}>
          {submitLabel || 'Save study'}
        </button>
      </div>
    </form>
  );
};

export default StudyEditor;
