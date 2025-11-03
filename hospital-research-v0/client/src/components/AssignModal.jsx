import { useState } from 'react';
import styles from './AssignModal.module.css';

const AssignModal = ({ patients = [], staff = [], onAssign, onClose }) => {
  const [selectedPatients, setSelectedPatients] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');

  const togglePatient = (pid) => {
    setSelectedPatients((prev) =>
      prev.includes(pid) ? prev.filter((item) => item !== pid) : [...prev, pid]
    );
  };

  const submit = (event) => {
    event.preventDefault();
    if (!selectedPatients.length) {
      setError('Select at least one patient');
      return;
    }
    if (!selectedStaff) {
      setError('Select a staff member');
      return;
    }
    setError('');
    onAssign({
      pid: selectedPatients,
      assignee: selectedStaff,
      dueAt: dueAt || undefined,
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Assign form</h2>
        <form onSubmit={submit} className={styles.form}>
          <section>
            <h3>Patients</h3>
            <div className={styles.list}>
              {patients.map((patient) => (
                <label key={patient.pid}>
                  <input
                    type="checkbox"
                    checked={selectedPatients.includes(patient.pid)}
                    onChange={() => togglePatient(patient.pid)}
                  />
                  <span>{patient.pid}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3>Assign to staff</h3>
            <select
              value={selectedStaff}
              onChange={(event) => setSelectedStaff(event.target.value)}
              required
            >
              <option value="">Select staff</option>
              {staff.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.displayName || member.email}
                  {member.category ? ` (${member.category})` : ''}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3>Due date</h3>
            <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </section>

          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.actions}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.primary}>
              Assign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignModal;
