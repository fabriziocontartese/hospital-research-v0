import styles from './FormTable.module.css';

const FormTable = ({ forms, onAssign, onSend, onPreview }) => {
  if (!forms.length) {
    return <div>No forms yet.</div>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Title</th>
          <th>Kind</th>
          <th>Deadline</th>
          <th>Updated</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {forms.map((form) => (
          <tr key={form._id}>
            <td>{form.schema?.title || form.version}</td>
            <td>{form.kind}</td>
            <td>{form.version && form.version !== 'No deadline' ? form.version : '—'}</td>
            <td>{new Date(form.updatedAt || form.createdAt).toLocaleString()}</td>
            <td className={styles.actions}>
              {onPreview ? (
                <button type="button" onClick={() => onPreview(form)}>
                  Preview
                </button>
              ) : null}
              {onAssign ? (
                <button type="button" onClick={() => onAssign(form)}>
                  Assign
                </button>
              ) : null}
              {onSend ? (
                <button type="button" onClick={() => onSend(form)}>
                  Send notice
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default FormTable;
