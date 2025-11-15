import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import styles from './TaskTable.module.css';

const STATUS_META = {
  open: { label: 'Pending', variant: 'primary' },
  submitted: { label: 'Completed', variant: 'success' },
  expired: { label: 'Overdue', variant: 'danger' },
};

const statusVariant = (status) => STATUS_META[status]?.variant || 'neutral';
const statusLabel = (status) => STATUS_META[status]?.label || status;

const assigneesLabel = (assignees = []) => {
  if (!assignees.length) return '—';
  const names = assignees.map((a) => a?.displayName || a?.email || '—');
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
};

const TaskTable = ({ tasks, onSelectTask, showAssignee = false }) => {
  if (!tasks.length) {
    return <div className={styles.emptyState}>No tasks found.</div>;
  }

  const isSubmittedStatus = (status) =>
    typeof status === 'string' && status.toLowerCase() === 'submitted';

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Patient</th>
            <th>Study &amp; form</th>
            <th>Due</th>
            <th>Status</th>
            {showAssignee ? <th>Assignees</th> : null}
            {onSelectTask ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => {
            const studyTitle = task.studyId?.title || '—';
            const formTitle = task.formId?.schema?.title || task.formId?.version || '—';
            const dueDate = task.dueAt ? new Date(task.dueAt).toLocaleDateString() : '—';

            return (
              <tr key={task._id}>
                <td className={styles.idCell}>{index + 1}</td>
                <td className={styles.patientCell}>
                  <span className={styles.mono}>{task.pid}</span>
                </td>
                <td className={styles.studyFormCell}>
                  <span className={styles.studyLabel}>{studyTitle}</span>
                  <span className={styles.formLabel}>{formTitle}</span>
                </td>
                <td>{dueDate}</td>
                <td>
                  <Badge variant={statusVariant(task.status)}>{statusLabel(task.status)}</Badge>
                </td>
                {showAssignee ? (
                  <td>{assigneesLabel(task.assignees)}</td>
                ) : null}
                {onSelectTask ? (
                  <td>
                    <Button size="sm" variant="primary" onClick={() => onSelectTask(task)}>
                      {isSubmittedStatus(task.status) ? 'Edit response' : 'Open form'}
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TaskTable;
