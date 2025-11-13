import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import styles from './PopulationTable.module.css';

const PopulationTable = ({
  patients,
  readOnly = false,
  onViewPatient, // (pid) => void
}) => {
  if (!patients?.length) {
    return <div className={styles.emptyState}>No patients found.</div>;
  }

  const getStatus = (patient) =>
    patient.status || (patient.isActive === false ? 'inactive' : 'active');

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Pseudonym</th>
          <th>Category</th>
          <th>Owner</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {patients.map((patient) => {
          const ownerEntry = patient.assignedStaff?.[0];
          const ownerLabel =
            typeof ownerEntry === 'string'
              ? ownerEntry
              : ownerEntry?.displayName || ownerEntry?.email || 'Unassigned';

          return (
            <tr key={patient._id || patient.pid}>
              <td className={styles.pidCell}>
                <span className={styles.pid}>{patient.pid}</span>
              </td>
              <td>
                {patient.category ? (
                  <Badge variant="primary">{patient.category}</Badge>
                ) : (
                  '—'
                )}
              </td>
              <td>{ownerLabel || 'Unassigned'}</td>
              <td>
                <Badge variant={getStatus(patient) === 'inactive' ? 'neutral' : 'success'}>
                  {getStatus(patient) === 'inactive' ? 'Inactive' : 'Active'}
                </Badge>
              </td>
              <td className={styles.actionsCell}>
                <div className={styles.actionGroup}>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onViewPatient?.(patient.pid)}
                  >
                    View
                  </Button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default PopulationTable;
