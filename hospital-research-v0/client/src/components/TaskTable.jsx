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

const TaskTable = ({ tasks, onSelectTask, showAssignee = false }) => {
  if (!tasks.length) {
    return <div className={styles.emptyState}>No tasks found.</div>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Study</th>
          <th>Form</th>
          <th>Patient</th>
          <th>Due</th>
          <th>Status</th>
          {showAssignee ? <th>Assignee</th> : null}
          {onSelectTask ? <th /> : null}
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task._id}>
            <td>{task.studyId?.title || '—'}</td>
            <td>{task.formId?.schema?.title || task.formId?.version}</td>
            <td className={styles.mono}>{task.pid}</td>
            <td>{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : '—'}</td>
            <td>
              <Badge variant={statusVariant(task.status)}>{statusLabel(task.status)}</Badge>
            </td>
            {showAssignee ? (
              <td>{task.assignee?.displayName || task.assignee?.email || '—'}</td>
            ) : null}
            {onSelectTask ? (
              <td>
                <Button size="sm" variant="primary" onClick={() => onSelectTask(task)}>
                  {task.status === 'submitted' || task.status === 'Completed' ? 'View response' : 'Open form'}
                </Button>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default TaskTable;
