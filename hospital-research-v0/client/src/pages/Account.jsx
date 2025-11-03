import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import UserTable from '../components/UserTable';
import styles from '../styles/AccountPage.module.css';

const Account = () => {
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creationMessage, setCreationMessage] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', roleFilter, statusFilter],
    queryFn: async () => {
      const params = {};
      if (roleFilter !== 'all') params.role = roleFilter;
      if (statusFilter !== 'all') params.isActive = statusFilter === 'active';
      const response = await apiClient.get('/api/users', { params });
      return response.data.users;
    },
  });

  const users = data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/api/users', payload).then((res) => res.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreationMessage(
        res.tempPassword
          ? `User created. Temporary password: ${res.tempPassword}`
          : 'User created.'
      );
      setShowCreate(false);
    },
    onError: (err) => {
      setCreationMessage(err.response?.data?.error || 'Unable to create user.');
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      apiClient.patch(`/api/users/${id}`, payload).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const onToggleActive = (user) => {
    patchMutation.mutate({
      id: user.id || user._id,
      payload: { isActive: !user.isActive },
    });
  };

  const onRoleChange = (user, nextRole) => {
    if (user.role === nextRole) return;
    patchMutation.mutate({
      id: user.id || user._id,
      payload: { role: nextRole },
    });
  };

  const onCategoryChange = (user, category) => {
    patchMutation.mutate({
      id: user.id || user._id,
      payload: { category },
    });
  };

  const onCreate = (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = {
      email: form.get('email'),
      displayName: form.get('displayName'),
      role: form.get('role'),
      category: form.get('category') || undefined,
    };
    setCreationMessage('');
    createMutation.mutate(payload);
  };

  const summary = useMemo(() => {
    const totals = users.reduce(
      (acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      },
      { admin: 0, researcher: 0, staff: 0 }
    );
    return totals;
  }, [users]);

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Account management</h1>
          <p>Manage team members, roles, and status within your organisation.</p>
        </div>
        <button type="button" className={styles.primary} onClick={() => setShowCreate(true)}>
          Invite user
        </button>
      </header>

      <section className={styles.summary}>
        <div>
          <span>Admins</span>
          <strong>{summary.admin}</strong>
        </div>
        <div>
          <span>Researchers</span>
          <strong>{summary.researcher}</strong>
        </div>
        <div>
          <span>Staff</span>
          <strong>{summary.staff}</strong>
        </div>
      </section>

      <section className={styles.filters}>
        <label>
          Role
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="admin">Admin</option>
            <option value="researcher">Researcher</option>
            <option value="staff">Staff</option>
          </select>
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </section>

      {creationMessage ? <div className={styles.notice}>{creationMessage}</div> : null}
      {error ? <div className={styles.error}>{error.response?.data?.error || error.message}</div> : null}
      {isLoading ? (
        <div>Loading users…</div>
      ) : (
        <UserTable
          users={users}
          onToggleActive={onToggleActive}
          onRoleChange={onRoleChange}
          onCategoryChange={onCategoryChange}
        />
      )}

      {showCreate ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>Invite a new user</h2>
            <form onSubmit={onCreate} className={styles.modalForm}>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Display name
                <input name="displayName" required />
              </label>
              <label>
                Category
                <input name="category" placeholder="e.g. Cardiology" />
              </label>
              <label>
                Role
                <select name="role" defaultValue="researcher">
                  <option value="researcher">Researcher</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primary} disabled={createMutation.isLoading}>
                  {createMutation.isLoading ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Account;
