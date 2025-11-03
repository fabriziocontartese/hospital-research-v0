import { useState } from 'react';
import styles from './UserTable.module.css';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

const roleLabels = {
  admin: 'Admin',
  researcher: 'Researcher',
  staff: 'Staff',
};

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const getUserKey = (user) => user.id || user._id || user.email;

const normalizeId = (value) => (value ? value.toString() : '');

const UserTable = ({
  users,
  teams = [],
  onSaveUser,
  onDeleteUser,
  savingUserId,
  deletingUserId,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  if (!users.length) {
    return <div className={styles.emptyState}>No team members yet.</div>;
  }

  const startEdit = (user) => {
    const userKey = getUserKey(user);
    setEditingId(userKey);
    setDraft({
      email: user.email,
      displayName: user.displayName || '',
      category: (user.category || '').trim(),
      role: user.role,
      status: user.isActive ? 'active' : 'inactive',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const handleDraftChange = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const handleSave = async (user) => {
    if (!draft || !onSaveUser) return;
    const payload = {
      email: draft.email.trim(),
      displayName: draft.displayName.trim(),
      role: draft.role,
      category: draft.category ? draft.category : null,
      isActive: draft.status === 'active',
    };

    try {
      await onSaveUser(user, payload);
      cancelEdit();
    } catch (error) {
      // Keep editing so the admin can adjust and retry
    }
  };

  const handleDelete = async (user) => {
    if (!onDeleteUser) return;
    try {
      await onDeleteUser(user);
    } catch (error) {
      // Ignore delete errors here; parent surfaces feedback
    }
  };

  const isSaveDisabled = (draftState) =>
    !draftState?.email.trim() || !draftState?.displayName.trim();

  const savingId = normalizeId(savingUserId);
  const deletingId = normalizeId(deletingUserId);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Email</th>
          <th>Name</th>
          <th>Team</th>
          <th>Role</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const userKey = getUserKey(user);
          const rowId = normalizeId(user.id || user._id);
          const isEditing = editingId === userKey;
          const rowDraft = isEditing ? draft : null;
          const saving = savingId && savingId === rowId;
          const deleting = deletingId && deletingId === rowId;

          return (
            <tr key={userKey} className={isEditing ? styles.editingRow : undefined}>
              <td>
                {isEditing ? (
                  <Input
                    type="email"
                    value={rowDraft.email}
                    onChange={(event) => handleDraftChange('email', event.target.value)}
                  />
                ) : (
                  user.email
                )}
              </td>
              <td>
                {isEditing ? (
                  <Input
                    value={rowDraft.displayName}
                    onChange={(event) => handleDraftChange('displayName', event.target.value)}
                    placeholder="Full name"
                  />
                ) : (
                  user.displayName || '—'
                )}
              </td>
              <td>
                {isEditing ? (
                  <select
                    value={rowDraft.category}
                    onChange={(event) => handleDraftChange('category', event.target.value)}
                    className={styles.selectField}
                  >
                    <option value="">No team</option>
                    {teams.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                ) : user.category ? (
                  user.category
                ) : (
                  '—'
                )}
              </td>
              <td>
                {isEditing ? (
                  <select
                    value={rowDraft.role}
                    onChange={(event) => handleDraftChange('role', event.target.value)}
                    className={styles.selectField}
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  roleLabels[user.role] || user.role
                )}
              </td>
              <td>
                {isEditing ? (
                  <select
                    value={rowDraft.status}
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
                  <Badge variant={user.isActive ? 'success' : 'neutral'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                )}
              </td>
              <td className={styles.actionsCell}>
                {isEditing ? (
                  <div className={styles.actionGroup}>
                    <Button
                      size="sm"
                      onClick={() => handleSave(user)}
                      disabled={saving || deleting || isSaveDisabled(rowDraft)}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={cancelEdit}
                      disabled={saving || deleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={styles.deleteButton}
                      onClick={() => handleDelete(user)}
                      disabled={deleting || saving}
                    >
                      {deleting ? 'Removing…' : 'Delete'}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => startEdit(user)}>
                    Edit
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default UserTable;
