import { useState } from 'react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import styles from './PopulationTable.module.css';

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const PopulationTable = ({
  patients,
  owners,
  categories = [],
  onSavePatient,
  savingPid,
  readOnly = false,
}) => {
  const [editingPid, setEditingPid] = useState(null);
  const [draft, setDraft] = useState(null);
  const actionsAvailable = !readOnly && typeof onSavePatient === 'function';

  if (!patients.length) {
    return <div className={styles.emptyState}>No patients found.</div>;
  }

  const getStatus = (patient) =>
    patient.status || (patient.isActive === false ? 'inactive' : 'active');

  const startEdit = (patient) => {
    if (!actionsAvailable) return;
    setEditingPid(patient.pid);
    const ownerEntry = patient.assignedStaff?.[0];
    const ownerId =
      typeof ownerEntry === 'string' ? ownerEntry : ownerEntry?._id || ownerEntry?.id || '';
    setDraft({
      pid: patient.pid,
      category: patient.category || '',
      ownerId: ownerId || '',
      status: getStatus(patient),
    });
  };

  const cancelEdit = () => {
    setEditingPid(null);
    setDraft(null);
  };

  const handleDraftChange = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const handleSave = async (patient) => {
    if (!actionsAvailable || !draft || !onSavePatient) return;

    const payload = {
      category: draft.category || null,
      status: draft.status,
      assignedStaff: draft.ownerId ? [draft.ownerId] : [],
    };

    const nextPid = draft.pid.trim().toUpperCase();
    if (nextPid && nextPid !== patient.pid) {
      payload.newPid = nextPid;
    }

    try {
      await onSavePatient(patient, payload);
      cancelEdit();
    } catch (error) {
      // Parent handles feedback; keep modal open for retry.
    }
  };

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Pseudonym</th>
          <th>Category</th>
          <th>Owner</th>
          <th>Status</th>
          {actionsAvailable ? <th /> : null}
        </tr>
      </thead>
      <tbody>
        {patients.map((patient) => {
          const isEditing = editingPid === patient.pid;
          const ownerEntry = patient.assignedStaff?.[0];
          const ownerLabel =
            typeof ownerEntry === 'string'
              ? ownerEntry
              : ownerEntry?.displayName || ownerEntry?.email || 'Unassigned';
          const isSaving = savingPid && savingPid === patient.pid;

          return (
            <tr key={patient._id} className={isEditing ? styles.editingRow : undefined}>
              <td className={styles.pidCell}>
                {isEditing ? (
                  <Input
                    value={draft.pid}
                    onChange={(event) => handleDraftChange('pid', event.target.value.toUpperCase())}
                    placeholder="PID-2025-001"
                  />
                ) : (
                  <span className={styles.pid}>{patient.pid}</span>
                )}
              </td>
              <td>
                {isEditing ? (
                  <select
                    value={draft.category}
                    onChange={(event) => handleDraftChange('category', event.target.value)}
                    className={styles.selectField}
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                ) : patient.category ? (
                  <Badge variant="primary">{patient.category}</Badge>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {isEditing ? (
                  <select
                    value={draft.ownerId}
                    onChange={(event) => handleDraftChange('ownerId', event.target.value)}
                    className={styles.selectField}
                  >
                    <option value="">Unassigned</option>
                    {owners.map((candidate) => (
                      <option key={candidate._id} value={candidate._id}>
                        {candidate.displayName || candidate.email} ({candidate.role})
                      </option>
                    ))}
                  </select>
                ) : ownerLabel && ownerLabel !== 'Unassigned' ? (
                  ownerLabel
                ) : (
                  'Unassigned'
                )}
              </td>
              <td>
                {isEditing ? (
                  <select
                    value={draft.status}
                    onChange={(event) => handleDraftChange('status', event.target.value)}
                    className={styles.selectField}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge variant={getStatus(patient) === 'inactive' ? 'neutral' : 'success'}>
                    {getStatus(patient) === 'inactive' ? 'Inactive' : 'Active'}
                  </Badge>
                )}
              </td>
              {actionsAvailable ? (
                <td className={styles.actionsCell}>
                  {isEditing ? (
                    <div className={styles.actionGroup}>
                      <Button
                        size="sm"
                        onClick={() => handleSave(patient)}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => startEdit(patient)}>
                      Edit
                    </Button>
                  )}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default PopulationTable;
